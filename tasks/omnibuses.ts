import chalk from "chalk";
import { task } from "hardhat/config";

import { passAragonVote, setupLdoHolder, startAragonVote } from "../src/aragon-votes-tools";
import prompt from "../src/common/prompt";
import * as env from "../src/common/env";
import fs from "node:fs/promises";
import fmt from "../src/common/format";

import { EthereumProvider } from "hardhat/types/providers";
import { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { findContainerByName, Repos, runImageInBackground, stopContainer } from "../src/docker";
import { runRepoTests } from "./sub-tasks/containers";
import { Address, formatEther } from "viem";
import {
  createDevRpcClient,
  createRpcClient,
  getChainIdByNetworkName,
  getLocalRpcUrl,
  NetworkName,
} from "../src/network/network";
import { privateKeyToAccount } from "viem/accounts";
import format from "../src/common/format";
import { Omnibus } from "../src/omnibuses/omnibus";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getRpcUrl } from "../src/network/network";
import files from "../src/common/files";
import { uploadDescription } from "./sub-tasks/upload-description";
import { DevRpcClient, RpcClient, WriteContractOptions } from "../src/network";
import { createTimedSpinner } from "../src/common/spinner";
import { ProposalStatus } from "../src/omnibuses/dual-governance";
import { logBlue } from "../src/common/color";
import { getGovernanceContracts } from "../src/omnibuses/governance-contracts";
import { getKeystores } from "../src/hardhat-keystores";
import { runHardhatTask } from "../src/hardhat/run-task";
import { adoptAragonVoting } from "../src/aragon-votes-tools";
import { renderDefaultOmnibusDeployment } from "../src/omnibuses/omnibus-deployment";
import { assertVoteAddresses } from "../src/omnibuses/address-lint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OMNIBUSES_DIR = path.resolve(__dirname, "..", "omnibuses");
const ARCHIVE_DIR = path.join(OMNIBUSES_DIR, "_archive");

const FORK_BLOCK_DESCRIPTION = "Fork block number; defaults to the latest block";

export const omnibusTaskBuilders: Array<ReturnType<typeof task>> = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TaskAction = (taskArguments: any, hre: HardhatRuntimeEnvironment) => any;

function asLazyAction(action: TaskAction) {
  return () => Promise.resolve({ default: action });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defineTask(...args: Parameters<typeof task>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = task(...args) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalSetAction = builder.setAction.bind(builder) as (action: unknown) => any;
  builder.setAction = (action: unknown) => {
    if (typeof action === "function" && action.length > 0) {
      return originalSetAction(asLazyAction(action as TaskAction));
    }
    return originalSetAction(action);
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  omnibusTaskBuilders.push(builder);
  return builder;
}

defineTask("omnibus:create", "Create new empty omnibus from the template").setAction(
  async (_taskArgs: Record<string, never>) => {
    const network: NetworkName = await prompt.select("Choose the network:", [
      { title: "Mainnet", value: "mainnet" },
      { title: "Holesky", value: "holesky" },
      { title: "Hoodi", value: "hoodi" },
    ]);

    const omnibusName = await prompt.text(
      `Enter the name of the omnibus in the format "yyyy_mm_dd_some_optional_info" (for example: 2025_12_31 or 2025_12_31_happy_new_year_omni):`,
    );

    if (omnibusName.length === 0) {
      throw new Error("Name can't be empty");
    }

    const omnibusNameRegExp = /^\d{4}_\d{2}_\d{2}(_[a-z0-9_]*)?$/gi;

    if (!omnibusNameRegExp.test(omnibusName)) {
      throw new Error("Invalid name. Omnibus name should match patter: yyyy_dd_mm_some_optional_info");
    }

    const newOmnibusDir = path.join(OMNIBUSES_DIR, omnibusName);
    const archivedOmnibusDir = await findArchivedOmnibusDir(omnibusName);

    if (archivedOmnibusDir) {
      throw new Error(`Omnibus ${omnibusName} is already archived at ${archivedOmnibusDir}`);
    }

    if (await files.touchDir(newOmnibusDir)) {
      throw new Error(`Omnibus ${newOmnibusDir} already exist`);
    }

    const templateDirName = "_omnibus_template";
    const templatePath = path.join(OMNIBUSES_DIR, templateDirName);

    await fs.cp(templatePath, newOmnibusDir, { recursive: true });

    const omnibusDescriptionPath = path.join(newOmnibusDir, `${omnibusName}.md`);
    const omnibusScriptPath = path.join(newOmnibusDir, `${omnibusName}.ts`);
    const omnibusContractName = `Omnibus_${omnibusName}`;
    const omnibusContractPath = path.join(newOmnibusDir, `${omnibusContractName}.sol`);
    const templateFileName = "_omnibus_template";

    await fs.rename(path.join(newOmnibusDir, `${templateFileName}.ts`), omnibusScriptPath);
    await fs.rename(path.join(newOmnibusDir, `${templateFileName}.md`), omnibusDescriptionPath);
    await fs.rename(path.join(newOmnibusDir, "OmnibusTemplate.sol"), omnibusContractPath);

    // replace name of the omnibus in the description markdown file
    const omnibusDescriptionContent = await fs.readFile(omnibusDescriptionPath, "utf-8");
    await fs.writeFile(
      omnibusDescriptionPath,
      omnibusDescriptionContent.replace("Omnibus Template", omnibusNameToDescriptionHeader(omnibusName)),
      { encoding: "utf-8" },
    );

    // replace network name in the omnibus script
    const omnibusScriptContent = await fs.readFile(omnibusScriptPath, "utf-8");

    await fs.writeFile(omnibusScriptPath, omnibusScriptContent.replace("mainnet", network), { encoding: "utf-8" });

    const omnibusContractContent = await fs.readFile(omnibusContractPath, "utf-8");
    await fs.writeFile(
      omnibusContractPath,
      omnibusContractContent
        .replace("contract OmnibusTemplate", `contract ${omnibusContractName}`)
        .replace(
          /(address public constant VOTING = )0x[\da-fA-F]{40}/,
          `$1${getGovernanceContracts(network).voting.address}`,
        ),
      { encoding: "utf-8" },
    );

    console.log(`Omnibus files were successfully created:`);
    console.log(`- Description file: ${omnibusDescriptionPath}`);
    console.log(`- Contract file: ${omnibusContractPath}`);
    console.log(`- Test file: ${omnibusScriptPath}`);
  },
);

defineTask("omnibus:archive", "Move launched omnibus to archive folder")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to move to archive" })
  .setAction(async (taskArgs: { name: string }, _hre: HardhatRuntimeEnvironment) => {
    const { name } = taskArgs;
    const omnibus = await loadOmnibus(name);

    if (!omnibus.voteId) {
      throw new Error(`Omnibus "${name}" "voteId" property is not set`);
    }

    if (!omnibus.launchedAt) {
      throw new Error(`Omnibus "${name}" launchedAt property is not set`);
    }

    if (omnibus.quorumReached === undefined) {
      throw new Error(`Omnibus doesn't have "quorumReached" property set`);
    }

    if (!omnibus.executedAt && omnibus.quorumReached !== false) {
      throw new Error(`Omnibus doesn't have "executedAt" property set and "quorumReached" is not false`);
    }

    const omnibusPath = path.join(OMNIBUSES_DIR, name);
    const archivePath = path.join(ARCHIVE_DIR, omnibus.network, name);

    await fs.cp(omnibusPath, archivePath, { errorOnExist: true, recursive: true });
    await fs.rm(omnibusPath, { recursive: true });

    console.log(`Omnibus ${name} was archived to ${archivePath}`);
  });

defineTask("omnibus:build", "Build Solidity omnibus contract(s) for the given omnibus")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to build contracts for" })
  .setAction(async (taskArgs: { name: string }, hre: HardhatRuntimeEnvironment) => {
    const { name } = taskArgs;
    assertVoteAddresses(await resolveOmnibusDir(name));
    await buildOmnibusContracts(hre, name);
    console.log(fmt.success(`Omnibus contracts for "${name}" compiled successfully`));
  });

function omnibusNameToDescriptionHeader(omnibusName: string) {
  return omnibusName
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/(\d{4}) (\d{2}) (\d{2})/g, "$1-$2-$3");
}

defineTask("omnibus:deploy", "Deploy the contracts of an omnibus")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to deploy" })
  .addFlag({ name: "broadcast", description: "broadcast the transaction to the network" })
  .setAction(async (taskArgs: { name: string; broadcast: boolean }, hre: HardhatRuntimeEnvironment) => {
    const { name, broadcast = false } = taskArgs;
    const omnibus = await loadOmnibus(name);
    const defaultContractName = omnibus.hasDeployMethod() ? undefined : await findDefaultOmnibusContractName(name);

    const deployment = omnibus.getDeployment();

    if (deployment && Object.keys(deployment).length > 0) {
      const deployedAddresses = Object.fromEntries(
        Object.entries(deployment).map(([name, contract]) => [name, contract.address]),
      );
      throw new Error(`Omnibus contracts already deployed at ${JSON.stringify(deployedAddresses)}`);
    }

    if (broadcast && defaultContractName) {
      await validateDefaultOmnibusDeploymentCanBeRecorded(name);
    }

    await buildOmnibusContracts(hre, name);

    const client = broadcast ? await createRpcClient(omnibus.network) : await prepareDevRpcClient(omnibus.network, hre);

    if (broadcast) {
      console.log(
        chalk.bold.yellowBright(
          `⚠️  "--broadcast" flag is set. Transaction will be sent to "${omnibus.network}" network\n`,
        ),
      );
    } else {
      console.log(
        chalk.bold.yellowBright(`⚠️  "--broadcast" flag is not set. Transaction will be run on a local dev RPC node\n`),
      );
    }

    const deployer = privateKeyToAccount(await getKeystores(hre).unlock());

    console.log(`Network: ${client.getNetworkName()}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${await client.getBalance(deployer.address)}`);

    await prompt.confirmOrAbort(`Deploy omnibus contract(s)?`);
    const deployedContracts = await deployOmnibusForLaunch(hre, client, omnibus, defaultContractName, {
      from: deployer,
    });

    console.log(`Deployed omnibus contracts:`);
    for (const [contractName, deployedContract] of Object.entries(deployedContracts)) {
      console.log(`  - "${contractName}" - ${deployedContract.label}[${deployedContract.address}]`);
    }

    if (broadcast && defaultContractName) {
      const deployedOmnibusContract = deployedContracts.omnibus;
      if (!deployedOmnibusContract) {
        throw new Error(`Default omnibus deployment didn't return an "omnibus" contract`);
      }
      const omnibusScriptPath = await getOmnibusScriptPath(name);
      await recordDefaultOmnibusDeployment(omnibusScriptPath, deployedOmnibusContract.address);
      console.log(`Saved deployment.omnibus to ${path.relative(process.cwd(), omnibusScriptPath)}`);
    }
  });

defineTask("omnibus:test", "Runs tests for the given omnibus at local node")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to test" })
  .addOption({ name: "forkBlock", description: FORK_BLOCK_DESCRIPTION, defaultValue: "" })
  .setAction(async (taskArgs: { name: string; forkBlock: string }, hre: HardhatRuntimeEnvironment) => {
    const { name } = taskArgs;
    assertVoteAddresses(await resolveOmnibusDir(name));
    const omnibus = await loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre, resolveForkBlock(taskArgs.forkBlock));
    await prepareOmnibus(hre, client, omnibus);

    await printEvmScript(name, omnibus.getEvmScript());

    await omnibus.test(client);
  });

defineTask("omnibus:test-solidity", "Runs Solidity tests (*.t.sol) for the given omnibus")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to test with Solidity runner" })
  .addOption({
    name: "grep",
    description: "Only run Solidity tests matching this grep pattern",
    defaultValue: "",
  })
  .addFlag({ name: "noCompile", description: "Don't compile before running Solidity tests" })
  .setAction(async (taskArgs: { name: string; grep: string; noCompile: boolean }, hre: HardhatRuntimeEnvironment) => {
    const { name, grep, noCompile } = taskArgs;
    const omnibusTestFiles = await collectOmnibusSolidityTests(name);

    await runHardhatTask(hre, ["test", "solidity"], {
      testFiles: omnibusTestFiles,
      grep: grep || undefined,
      noCompile: Boolean(noCompile),
    });
  });

defineTask("omnibus:trace", "Trace the omnibus with given name and shows the execution trace")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .setAction(async (taskArgs: OmnibusLaunchParams, hre: HardhatRuntimeEnvironment) => {
    const { name } = taskArgs;
    const omnibus = await loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);
    await prepareOmnibus(hre, client, omnibus);

    console.log(`Tracing the omnibus "${name}" on "${omnibus.network}" network\n`);

    await omnibus.trace(client);
  });

type RepositorySuite = Exclude<Repos, "depot">;

export function getRepositorySuites(repo?: string): RepositorySuite[] {
  const repositories: RepositorySuite[] = ["core", "dual-governance", "scripts", "staking-modules", "stonks"];
  if (!repo) {
    return repositories;
  }
  const selected = repositories.find((repository) => repository === repo);
  if (!selected) {
    throw new Error(`Unsupported repo "${repo}"`);
  }
  return [selected];
}

export async function runRepositorySuites(
  client: Pick<DevRpcClient, "withSnapshot">,
  repositories: readonly RepositorySuite[],
  runSuite: (repository: RepositorySuite) => Promise<void>,
): Promise<void> {
  for (const repository of repositories) {
    await client.withSnapshot(() => runSuite(repository));
    console.log(`Tests run for repo "${repository}" has finished successfully`);
  }
}

defineTask("omnibus:multi-test", "Runs tests for the given omnibus cross repo")
  .addPositionalArgument({
    name: "name",
    description: "Name of the omnibus to run; omit to run the suites on a bare fork",
    defaultValue: "",
  })
  .addOption({
    name: "repo",
    description: "Name of the repo for test: core|scripts|dual-governance|staking-modules|stonks",
    defaultValue: "",
  })
  .addOption({
    name: "pattern",
    description: "Pattern for test run",
    defaultValue: "",
  })
  .addFlag({ name: "mountTests", description: "Mount test files from /mount/<repo> to external repo test dir" })
  .addOption({ name: "forkBlock", description: FORK_BLOCK_DESCRIPTION, defaultValue: "" })
  .setAction(
    async (
      taskArgs: { name: string; repo: string; pattern: string; mountTests: boolean; forkBlock: string },
      hre: HardhatRuntimeEnvironment,
    ) => {
      const { name, repo, pattern, mountTests } = taskArgs;
      const forkBlock = resolveForkBlock(taskArgs.forkBlock);
      const normalizedName = name || undefined;
      const normalizedRepo = repo || undefined;
      const normalizedPattern = pattern || undefined;
      const repoNamesToTest = getRepositorySuites(normalizedRepo);
      let node: LocalRpcNode;

      let snapshotId;
      if (normalizedName) {
        const omnibus = await loadOmnibus(normalizedName);

        node = await prepareLocalRpcNode(omnibus.network, forkBlock);
        snapshotId = await node.client.snapshot();

        await prepareOmnibus(hre, node.client, omnibus);
        await omnibus.passOmnibus(node.client);
      } else {
        console.log("Omnibus name doesn't pass. Run tests without passing any omnibuses");
        node = await prepareLocalRpcNode("mainnet", forkBlock);
        snapshotId = await node.client.snapshot();
      }

      try {
        const hideDebug = repoNamesToTest.length > 1;

        await runRepositorySuites(node.client, repoNamesToTest, (repository) =>
          runRepoTests(repository, normalizedPattern, hideDebug, mountTests),
        );
      } finally {
        await node.client.revert(snapshotId);
        if (node.startedByUs) {
          await stopLocalRpcNode();
        }
      }
    },
  );

defineTask("omnibus:ci-prepare", "Prepare omnibus vote on CI (adopt aragon voting on local node)")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .setAction(async (taskArgs: { name: string }, hre: HardhatRuntimeEnvironment) => {
    const { name } = taskArgs;
    const omnibus = await loadOmnibus(name);

    const client = await createDevRpcClient(omnibus.network, getLocalRpcUrl(env.ETH_LOCAL_RPC_PORT()));
    await prepareOmnibus(hre, client, omnibus);
    await adoptAragonVoting(client, omnibus.getEvmScript(), omnibus.formatDescription());
  });

type OmnibusLaunchParams = {
  name: string;
  broadcast: boolean;
};

defineTask("omnibus:launch", "Launch the omnibus with given name")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .addFlag({ name: "broadcast", description: "broadcast the transaction to the network" })
  .setAction(async (taskArgs: OmnibusLaunchParams, hre: HardhatRuntimeEnvironment) => {
    const { name, broadcast } = taskArgs;
    const omnibus = await loadOmnibus(name);

    if (omnibus.voteId || omnibus.launchedAt || omnibus.executedAt) {
      throw new Error(`The omnibus "${omnibus.voteId}" already lunched. Aborting...`);
    }

    const client = broadcast ? await createRpcClient(omnibus.network) : await prepareDevRpcClient(omnibus.network, hre);

    await prepareOmnibus(hre, client, omnibus);

    const description = await readOmnibusDescriptionFile(name);

    const descriptionUrl = await uploadDescription(name, description, false);
    const voteDescription = omnibus.formatDescription(descriptionUrl);
    const evmScript = omnibus.getEvmScript();

    console.log();

    console.log(chalk.bold.underline("Omnibus calls:\n"));
    console.log(omnibus.format({ padLength: 1 }));
    console.log();

    console.log(chalk.bold.underline("Omnibus Aragon Vote description:\n"));
    console.log(chalk.gray(voteDescription));
    console.log();

    console.log(chalk.bold.underline("Omnibus IPFS description:\n"));
    console.log(chalk.gray(description));
    console.log();

    await printEvmScript(name, evmScript);

    if (broadcast) {
      console.log(
        chalk.bold.yellowBright(
          `⚠️  "--broadcast" flag is set. Transaction will be sent to "${omnibus.network}" network\n`,
        ),
      );
    } else {
      console.log(
        chalk.bold.yellowBright(`⚠️  "--broadcast" flag is not set. Transaction will be run on a local dev RPC node\n`),
      );
    }

    const pilot = privateKeyToAccount(await getKeystores(hre).unlock());

    const { ldo } = getGovernanceContracts(omnibus.network);
    const [nonce, ethBalance, ldoBalanceInitial] = await Promise.all([
      client.getTransactionCount({ address: pilot.address }),
      client.getBalance(pilot.address),
      client.read(ldo, "balanceOf", [pilot.address]),
    ]);
    let ldoBalance = ldoBalanceInitial;

    if (!broadcast && ldoBalance === 0n) {
      const spinner = createTimedSpinner("Preparing pilot for the test launch...");
      await setupLdoHolder(client as DevRpcClient, pilot.address);
      ldoBalance = await client.read(ldo, "balanceOf", [pilot.address]);
      spinner.succeed("Pilot was successfully prepared. Make sure account will heave enough LDO on launch");
      console.log();
    }

    console.log();

    console.log(`Pilot: ${format.address(pilot.address)}`);
    console.log(`    - nonce: ${nonce}`);
    console.log(`    - ETH balance: ${formatEther(ethBalance)}`);
    console.log(`    - LDO balance: ${formatEther(ldoBalance)}`);
    console.log();

    await prompt.confirmOrAbort(`Proceed?`);

    const { receipt, voteId } = await startAragonVote(client, evmScript, voteDescription, {
      from: pilot,
    });

    console.log(`Vote id ${voteId} successfully launched:`);
    console.log(` - tx hash: ${receipt.transactionHash}`);
    console.log(` - block number: ${receipt.blockNumber}`);
  });

defineTask("omnibus:pass-aragon-vote", "Adopt Aragon Vote with the given id")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "voteId", description: "Aragon Vote id" })
  .setAction(async (taskArgs: { networkName: NetworkName; voteId: string }, hre: HardhatRuntimeEnvironment) => {
    const { networkName, voteId } = taskArgs;
    const client = await prepareDevRpcClient(networkName, hre);

    const parsedVoteId = BigInt(voteId);
    const receipt = await passAragonVote(client, parsedVoteId);
    console.log(`Aragon vote with id ${parsedVoteId} was executed at block ${receipt.blockNumber}`);
  });

defineTask("omnibus:schedule-proposal", "Schedule proposal into DG")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "proposalId", description: "Proposal id" })
  .setAction(async (taskArgs: { networkName: NetworkName; proposalId: string }, hre: HardhatRuntimeEnvironment) => {
    const { networkName, proposalId } = taskArgs;
    const client = await prepareDevRpcClient(networkName, hre);
    const parsedProposalId = BigInt(proposalId);

    const { timelock, dualGovernance } = getGovernanceContracts(networkName);
    const [[stranger], chainTime, afterSubmitDelay, proposal] = await Promise.all([
      client.getAccounts(),
      client.getChainTime(),
      client.read(timelock, "getAfterSubmitDelay", []),
      client.read(timelock, "getProposalDetails", [parsedProposalId]),
    ]);

    if (proposal.status !== ProposalStatus.Submitted) {
      throw new Error(`Unexpected proposal with id ${parsedProposalId} in a wrong state: ${ProposalStatus.Submitted}`);
    }

    const submittedAt = proposal.submittedAt;
    if (chainTime < submittedAt + afterSubmitDelay) {
      await client.setTime(submittedAt + afterSubmitDelay + 1);
    }
    await client.write(dualGovernance, "scheduleProposal", [parsedProposalId], { from: stranger });
  });

defineTask("omnibus:execute-proposal", "Executes proposal with a given id")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "proposalId", description: "Proposal id" })
  .setAction(async (taskArgs: { networkName: NetworkName; proposalId: string }, hre: HardhatRuntimeEnvironment) => {
    const { networkName, proposalId } = taskArgs;
    const client = await prepareDevRpcClient(networkName, hre);
    const parsedProposalId = BigInt(proposalId);

    const { timelock } = getGovernanceContracts(networkName);
    const [[stranger], chainTime, afterScheduleDelay, proposal] = await Promise.all([
      client.getAccounts(),
      client.getChainTime(),
      client.read(timelock, "getAfterScheduleDelay", []),
      client.read(timelock, "getProposalDetails", [parsedProposalId]),
    ]);

    if (proposal.status !== ProposalStatus.Scheduled) {
      throw new Error(`Unexpected proposal with id ${parsedProposalId} in a wrong state: ${ProposalStatus.Submitted}`);
    }

    const scheduledAt = proposal.scheduledAt;
    if (chainTime < scheduledAt + afterScheduleDelay) {
      await client.setTime(scheduledAt + afterScheduleDelay + 1);
    }
    const executeReceipt = await client.write(timelock, "execute", [parsedProposalId], { from: stranger });
    console.log(`Proposal with id ${parsedProposalId} successfully executed at block ${executeReceipt.blockNumber}`);
    console.log(` - tx hash: ${executeReceipt.transactionHash}`);
  });

async function printEvmScript(name: string, evmScript: string) {
  const evmScriptPath = path.join(await resolveOmnibusDir(name), `${name}.evm-script.hex`);
  await fs.writeFile(evmScriptPath, evmScript + "\n");

  console.log(chalk.bold.underline("Omnibus EVM script:\n"));
  console.log(chalk.greenBright(evmScript));
  console.log(chalk.gray(`\nSaved to ${path.relative(process.cwd(), evmScriptPath)}\n`));
}

async function readOmnibusDescriptionFile(name: string): Promise<string> {
  const descriptionFilePath = path.join(await resolveOmnibusDir(name), `${name}.md`);
  return fs.readFile(descriptionFilePath, { encoding: "utf-8" });
}

async function loadOmnibus(name: string): Promise<Omnibus> {
  const omnibusModulePath = await getOmnibusScriptPath(name);
  const omnibusModule = await import(pathToFileURL(omnibusModulePath).href);
  const omnibus: Omnibus = omnibusModule.default;
  omnibus.setName(name);
  return omnibus;
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** `omnibuses/_archive/<network>/<name>`, or `undefined` when the omnibus is not archived. */
async function findArchivedOmnibusDir(name: string): Promise<string | undefined> {
  const networkDirs = (await isDirectory(ARCHIVE_DIR)) ? await fs.readdir(ARCHIVE_DIR) : [];
  const archivedDirs: string[] = [];
  for (const networkDir of networkDirs) {
    const archivedDir = path.join(ARCHIVE_DIR, networkDir, name);
    if (await isDirectory(archivedDir)) {
      archivedDirs.push(archivedDir);
    }
  }

  if (archivedDirs.length > 1) {
    throw new Error(`Omnibus "${name}" is archived for several networks: ${archivedDirs.join(", ")}`);
  }
  return archivedDirs[0];
}

/** An omnibus lives in `omnibuses/<name>` until it is archived to `omnibuses/_archive/<network>/<name>`. */
async function resolveOmnibusDir(name: string): Promise<string> {
  const activeDir = path.join(OMNIBUSES_DIR, name);
  if (await isDirectory(activeDir)) {
    return activeDir;
  }

  const archivedDir = await findArchivedOmnibusDir(name);
  if (!archivedDir) {
    throw new Error(`Omnibus "${name}" not found in ${activeDir} or ${path.join(ARCHIVE_DIR, "<network>", name)}`);
  }
  return archivedDir;
}

async function getOmnibusScriptPath(name: string): Promise<string> {
  return path.join(await resolveOmnibusDir(name), `${name}.ts`);
}

async function validateDefaultOmnibusDeploymentCanBeRecorded(name: string): Promise<void> {
  const source = await fs.readFile(await getOmnibusScriptPath(name), "utf-8");
  renderDefaultOmnibusDeployment(source, "0x0000000000000000000000000000000000000000");
}

export async function recordDefaultOmnibusDeployment(omnibusScriptPath: string, address: Address): Promise<void> {
  const source = await fs.readFile(omnibusScriptPath, "utf-8");
  const updatedSource = renderDefaultOmnibusDeployment(source, address);
  await fs.writeFile(omnibusScriptPath, updatedSource, "utf-8");
}

export function deployOmnibusForLaunch(
  hre: HardhatRuntimeEnvironment,
  client: RpcClient,
  omnibus: Omnibus,
  defaultContractName: string | undefined,
  txOptions: WriteContractOptions,
) {
  return defaultContractName
    ? omnibus.deployOmnibusContract(hre.artifacts, client, defaultContractName, txOptions)
    : omnibus.deployOmnibusContracts(hre.artifacts, client, txOptions);
}

const LOCAL_RPC_NODE_CONTAINER = "hh-rpc-node";

interface LocalRpcNode {
  client: DevRpcClient;
  /** only a node started by us is stopped at the end */
  startedByUs: boolean;
}

async function stopLocalRpcNode() {
  const container = await findContainerByName(LOCAL_RPC_NODE_CONTAINER);
  if (container) {
    await stopContainer(container, LOCAL_RPC_NODE_CONTAINER, true);
  }
}

async function prepareLocalRpcNode(network: NetworkName, forkBlock?: bigint): Promise<LocalRpcNode> {
  const name = LOCAL_RPC_NODE_CONTAINER;
  // the image starts `hardhat node` forking from the latest block; the pin goes through the CLI flag
  const cmd = forkBlock ? ["npx", "hardhat", "node", "--fork-block-number", forkBlock.toString()] : ["npm", "start"];
  const image = env.HH_NODE_IMAGE();

  const port = env.ETH_LOCAL_RPC_PORT();
  const localRpcUrl = getLocalRpcUrl(port);

  let runningNodeClient: DevRpcClient | undefined;
  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localRpcUrl}...`, 2));
    runningNodeClient = await createDevRpcClient(network, localRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localRpcUrl}\n`));
  } catch (error) {
    console.log(fmt.padded(`Failed to connect to local RPC: "${(error as Error).message.split("\n")[0]}"`, 4));
  }
  if (runningNodeClient) {
    await assertForkBlock(runningNodeClient, forkBlock);
    return { client: runningNodeClient, startedByUs: false };
  }

  logBlue(`Run ${name} container${forkBlock ? ` pinned to block ${forkBlock}` : ""}`);
  await runImageInBackground(name, image, cmd, false, {
    Env: [`ETH_RPC_URL=${getRpcUrl(network)}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostPort: port }] } },
  });

  const client = await createDevRpcClient(network, getLocalRpcUrl(port));
  await assertForkBlock(client, forkBlock);
  return { client, startedByUs: true };
}

function resolveForkBlock(taskArg: string): bigint | undefined {
  if (!taskArg) {
    return undefined;
  }
  if (!/^\d+$/.test(taskArg)) {
    throw new Error(`Fork block must be a positive integer, got "${taskArg}"`);
  }
  return BigInt(taskArg);
}

/** A node started elsewhere keeps its own block — refuse to test on a wrong one instead of passing silently. */
async function assertForkBlock(client: DevRpcClient, forkBlock?: bigint) {
  if (forkBlock === undefined) {
    return;
  }
  const blockNumber = await client.getBlockNumber();
  if (blockNumber !== forkBlock) {
    throw new Error(
      `The RPC node at ${client.getRpcUrl()} is at block ${blockNumber}, but fork block ${forkBlock} was requested. ` +
        `Restart the node at that block or drop the --fork-block pin.`,
    );
  }
  console.log(fmt.padded(`Fork pinned to block ${forkBlock}`, 2));
}

async function prepareDevRpcClient(networkName: NetworkName, hre: HardhatRuntimeEnvironment, forkBlock?: bigint) {
  console.log("⏳Preparing local dev RPC client...");
  const localDevRpcUrl = getLocalRpcUrl(env.ETH_LOCAL_RPC_PORT());
  const targetRpcUrl = getRpcUrl(networkName);

  let standaloneClient: DevRpcClient | undefined;
  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localDevRpcUrl}...`, 2));
    standaloneClient = await createDevRpcClient(networkName, localDevRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localDevRpcUrl}\n`));
  } catch (error) {
    console.log(fmt.padded(`Failed to connect to local RPC: "${(error as Error).message.split("\n")[0]}"`, 4));
    console.log(fmt.padded(`Trying to connect the in-process hardhat dev RPC node...`, 2));
  }
  if (standaloneClient) {
    await assertForkBlock(standaloneClient, forkBlock);
    return standaloneClient;
  }

  const connectLocalDevNetwork = () => {
    const networkApi = (hre as unknown as Record<string, unknown>).network as Record<string, unknown> | undefined;
    const networkManagerApi = (hre as unknown as Record<string, unknown>).networkManager as
      | Record<string, unknown>
      | undefined;
    const connectFn =
      typeof networkApi?.connect === "function"
        ? networkApi.connect.bind(networkApi)
        : typeof networkManagerApi?.connect === "function"
          ? networkManagerApi.connect.bind(networkManagerApi)
          : null;

    if (!connectFn) {
      throw new Error(`Hardhat network connection API is not available on HRE`);
    }

    return connectFn({
      network: "default",
      override: {
        chainId: getChainIdByNetworkName(networkName),
        forking: {
          enabled: true,
          url: targetRpcUrl,
          ...(forkBlock === undefined ? {} : { blockNumber: Number(forkBlock) }),
        },
      },
    });
  };

  let networkConnection: { networkName?: string; networkConfig?: { type?: string }; provider?: unknown } | undefined;
  try {
    networkConnection = (await connectLocalDevNetwork()) as typeof networkConnection;
  } catch (error) {
    throw new Error(
      `Failed to connect to local in-process dev network "default": ${(error as Error).message}. ` +
        `Run without "--network" for local dev execution or start a standalone local RPC node.`,
    );
  }

  if (networkConnection?.networkName !== "default" || networkConnection?.networkConfig?.type !== "edr-simulated") {
    throw new Error(
      `Unexpected fallback network "${String(networkConnection?.networkName)}" of type "${String(networkConnection?.networkConfig?.type)}". ` +
        `Expected "default" (edr-simulated). Refusing to use non-local provider for dev reset.`,
    );
  }

  const builtinHardhatClient = await createDevRpcClient(networkName, networkConnection.provider as EthereumProvider);
  const providerRpcUrl = builtinHardhatClient.getRpcUrl();
  if (providerRpcUrl && !providerRpcUrl.includes("localhost") && !providerRpcUrl.includes("127.0.0.1")) {
    throw new Error(
      `In-process dev RPC fallback resolved to a non-local provider (${providerRpcUrl}). ` +
        `Run without "--network" or start local RPC explicitly.`,
    );
  }

  console.log(fmt.success(`Successfully connected to the in-process hardhat dev RPC node\n`));
  await assertForkBlock(builtinHardhatClient, forkBlock);

  return builtinHardhatClient;
}

export async function prepareOmnibus(
  hre: HardhatRuntimeEnvironment,
  client: DevRpcClient | RpcClient,
  omnibus: Omnibus,
) {
  console.log(`⏳Preparing omnibus "${omnibus.name}"...`);

  const defaultContractName = omnibus.hasDeployMethod()
    ? undefined
    : await findDefaultOmnibusContractName(omnibus.name);

  console.log(`Omnibus "${omnibus.name}" is launched from a contract, preparing it for the launch...`);
  let deployment = omnibus.getDeployment();
  if (deployment && Object.keys(deployment).length > 0) {
    console.log(`Contracts already deployed:`);
    for (const [name, contract] of Object.entries(deployment)) {
      console.log(`  - "${name}" - ${contract.label}[${contract.address}]`);
    }
  } else if (client instanceof DevRpcClient) {
    console.log(fmt.padded("Compiling contracts before deploy...", 3));
    await buildOmnibusContracts(hre, omnibus.name, true);
    console.log(fmt.padded(fmt.success("Contracts compiled successfully"), 3));

    const [deployer] = await client.getAccounts();
    console.log(fmt.padded(`Deploying omnibus contracts using test account ${deployer}`, 3));
    deployment = defaultContractName
      ? await omnibus.deployOmnibusContract(
          hre.artifacts,
          client,
          defaultContractName,
          { from: deployer },
          { padLength: 4 },
        )
      : await omnibus.deployOmnibusContracts(hre.artifacts, client, { from: deployer }, { padLength: 4 });
    console.log(fmt.padded(fmt.success(`All contracts successfully deployed:`), 3));
    for (const [name, contract] of Object.entries(deployment)) {
      console.log(`  - "${name}" - ${contract.label}[${contract.address}]`);
    }
  } else {
    throw new Error(
      `Omnibus contracts was not deployed. Use "omnibus:deploy <omnibus_name> --broadcast" command to deploy contracts`,
    );
  }

  if (deployment.omnibus) {
    console.log(fmt.padded(`Loading and validating omnibus calls from the contract...`, 2));
    await omnibus.loadAndValidateOmnibusContractCalls(client);
    console.log(fmt.padded(fmt.success(`Omnibus calls successfully validated`), 2));

    console.log(fmt.padded(`Validating Dual Governance proposal descriptions...`, 2));
    omnibus.validateDgProposalDescriptions(await readOmnibusDescriptionFile(omnibus.name));
    console.log(fmt.padded(fmt.success(`Proposal descriptions match the description file`), 2));
  } else {
    throw new Error(`Omnibus deployment must contain an "omnibus" contract`);
  }
  console.log(fmt.success("Omnibus prepared\n"));

  return omnibus;
}

async function collectOmnibusSolidityFiles(omnibusDirPath: string): Promise<string[]> {
  return fs
    .readdir(omnibusDirPath)
    .then((entries) => entries.filter((entry) => entry.endsWith(".sol") && !entry.endsWith(".t.sol")))
    .then((entries) => entries.map((entry) => path.relative(process.cwd(), path.join(omnibusDirPath, entry))));
}

/**
 * @returns name of the contract to deploy for an omnibus without a "deploy" section
 */
async function findDefaultOmnibusContractName(omnibusName: string): Promise<string> {
  const omnibusSolidityFiles = await collectOmnibusSolidityFiles(await resolveOmnibusDir(omnibusName));

  if (omnibusSolidityFiles.length === 0) {
    throw new Error(`Omnibus "${omnibusName}" has no Solidity contract`);
  }

  if (omnibusSolidityFiles.length > 1) {
    throw new Error(
      `Omnibus "${omnibusName}" contains more than one Solidity contract, so it has to deploy them in its ` +
        `"deploy" section: ${omnibusSolidityFiles.join(", ")}`,
    );
  }

  return path.basename(omnibusSolidityFiles[0], ".sol");
}

async function buildOmnibusContracts(hre: HardhatRuntimeEnvironment, omnibusName: string, quiet = false) {
  const omnibusDirPath = await resolveOmnibusDir(omnibusName);
  const omnibusSolidityFiles = await collectOmnibusSolidityFiles(omnibusDirPath);

  if (omnibusSolidityFiles.length === 0) {
    throw new Error(`No Solidity contracts found in omnibus folder: ${omnibusDirPath}`);
  }

  await runHardhatTask(hre, "build", {
    quiet,
    noTests: true,
    files: omnibusSolidityFiles,
  });
}

async function collectOmnibusSolidityTests(omnibusName: string): Promise<string[]> {
  const omnibusDirPath = await resolveOmnibusDir(omnibusName);

  const walk = async (currentPath: string): Promise<string[]> => {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(absolutePath)));
      } else if (entry.isFile() && absolutePath.endsWith(".t.sol")) {
        files.push(path.relative(process.cwd(), absolutePath));
      }
    }

    return files;
  };

  const testFiles = await walk(omnibusDirPath);
  if (testFiles.length === 0) {
    throw new Error(`No Solidity tests (*.t.sol) found in omnibus folder: ${omnibusDirPath}`);
  }

  return testFiles.sort();
}
