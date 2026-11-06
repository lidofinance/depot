import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EthereumProvider } from "hardhat/types/providers";
import { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { Address, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { passAragonVote, setupLdoHolder, startAragonVote } from "@/src/aragon-votes-tools";
import { logBlue } from "@/src/common/color";
import * as env from "@/src/common/env";
import { errorMessage, KnownError } from "@/src/common/errors";
import fmt from "@/src/common/format";
import prompt from "@/src/common/prompt";
import { createTimedSpinner } from "@/src/common/spinner";
import {
  findContainerByName,
  RepositorySuite,
  resolveRepoImage,
  runImageInBackground,
  stopContainer,
} from "@/src/docker";
import { getKeystores } from "@/src/hardhat-keystores";
import { calculateCid, getUrlByCidV1 } from "@/src/ipfs/utils";
import {
  createDevRpcClient,
  createRpcClient,
  DevRpcClient,
  getChainIdByNetworkName,
  getLocalRpcUrl,
  getRpcUrl,
  NetworkName,
  RpcClient,
  WriteContractOptions,
} from "@/src/network";
import { Omnibus } from "@/src/omnibuses";
import { assertVoteAddresses } from "@/src/omnibuses/address-lint";
import { ProposalStatus } from "@/src/omnibuses/dual-governance";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import {
  renderCustomOmnibusDeployment,
  renderDefaultOmnibusDeployment,
  renderVoteId,
} from "@/src/omnibuses/omnibus-deployment";
import { readVoteExecution, readVoteState } from "@/src/omnibuses/vote-state";
import { createTaskRegistry, lazy } from "./define-task";
import { runAcceptance } from "./sub-tasks/acceptance";
import { REPO_BRANCHES, runRepoTests, SUITE_NETWORKS } from "./sub-tasks/containers";
import { runSnapshots } from "./sub-tasks/snapshot";
import { uploadDescription } from "./sub-tasks/upload-description";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORK_BLOCK_DESCRIPTION = "Fork block number; defaults to the latest block";

export const omnibusTaskDeps = {
  getOmnibusesDir: () => path.resolve(__dirname, "..", "omnibuses"),
  assertNodeOnRealChain,
  createRpcClient,
  runSnapshots,
  startAragonVote,
  uploadDescription,
};

const { builders: omnibusTaskBuilders, defineTask } = createTaskRegistry();
export { omnibusTaskBuilders };

defineTask("omnibus:create", "Create new empty omnibus from the template").setAction(
  lazy(async () => {
    const network: NetworkName = await prompt.select("Choose the network:", [
      { title: "Mainnet", value: "mainnet" },
      { title: "Hoodi", value: "hoodi" },
    ]);

    const omnibusName = await prompt.text(
      `Enter the name of the omnibus in the format "yyyy_mm_dd_some_optional_info" (for example: 2025_12_31 or 2025_12_31_happy_new_year_omni):`,
    );

    if (omnibusName.length === 0) {
      throw new KnownError("Name can't be empty");
    }

    const omnibusNameRegExp = /^\d{4}_\d{2}_\d{2}(_[a-z0-9_]*)?$/gi;

    if (!omnibusNameRegExp.test(omnibusName)) {
      throw new KnownError("Invalid name. Omnibus name should match pattern: yyyy_mm_dd_some_optional_info");
    }

    const [existingOmnibusDir] = await findOmnibusDirs(omnibusName);
    if (existingOmnibusDir) {
      throw new KnownError(`Omnibus ${omnibusName} already exists at ${existingOmnibusDir}`);
    }

    const upgrade = await prompt.confirm("Does the vote contain a protocol upgrade?");

    const newOmnibusDir = path.join(omnibusTaskDeps.getOmnibusesDir(), "ongoing", network, omnibusName);
    await fs.mkdir(path.dirname(newOmnibusDir), { recursive: true });

    const templateDirName = "_omnibus_template";
    const templatePath = path.join(omnibusTaskDeps.getOmnibusesDir(), templateDirName);

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

    await fs.writeFile(
      omnibusScriptPath,
      omnibusScriptContent.replace("mainnet", network).replace("upgrade: false", `upgrade: ${upgrade}`),
      { encoding: "utf-8" },
    );

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
  }),
);

defineTask("omnibus:archive", "Move launched omnibus to archive folder")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to move to archive" })
  .setAction(
    lazy(async (taskArgs: { name: string }) => {
      const { name } = taskArgs;
      const omnibus = await loadOmnibus(name);

      if (omnibus.voteId === undefined) {
        throw new KnownError(`Omnibus "${name}" "voteId" property is not set`);
      }

      const omnibusPath = await resolveOmnibusDir(name);
      const ongoingPath = path.join(omnibusTaskDeps.getOmnibusesDir(), "ongoing", omnibus.network, name);
      if (omnibusPath !== ongoingPath) {
        throw new KnownError(`Only an ongoing omnibus can be archived; "${name}" is at ${omnibusPath}`);
      }
      const archivePath = path.join(omnibusTaskDeps.getOmnibusesDir(), "archive", omnibus.network, name);

      const client = await omnibusTaskDeps.createRpcClient(omnibus.network);
      const voteId = BigInt(omnibus.voteId);
      const vote = await readVoteState(client, voteId);
      const deployment = omnibus.getDeployment();
      if (!deployment || !("omnibus" in deployment)) {
        throw new KnownError(`Omnibus "${name}" "deployment.omnibus" is not set`);
      }
      if (!(await client.read(omnibus.getOmnibusContract(), "isValidVoteScript", [voteId]))) {
        throw new KnownError(`Vote ${voteId} script does not match the omnibus contract; check voteId`);
      }
      if (vote.executed) {
        const { proposals } = await readVoteExecution(client, voteId, vote.snapshotBlock);
        const unfinished = proposals.filter(
          (proposal) => proposal.status !== ProposalStatus.Executed && proposal.status !== ProposalStatus.Cancelled,
        );
        if (unfinished.length > 0) {
          const list = unfinished.map((proposal) => `${proposal.id} (${ProposalStatus[proposal.status]})`).join(", ");
          throw new KnownError(`Vote ${voteId} is executed, but its DG proposals are not: ${list}`);
        }
        const cancelled = proposals.filter((proposal) => proposal.status === ProposalStatus.Cancelled);
        if (cancelled.length > 0) {
          console.log(
            chalk.yellow(
              `⚠ DG proposals [${cancelled.map((proposal) => proposal.id)}] of vote ${voteId} are cancelled: ` +
                `the vote finished without result`,
            ),
          );
        } else {
          console.log(`Vote ${voteId} and its DG proposals [${proposals.map((proposal) => proposal.id)}] are executed`);
        }
      } else if (vote.open || vote.canExecute) {
        throw new KnownError(`Vote ${voteId} is not finished: open=${vote.open}, executable=${vote.canExecute}`);
      } else {
        console.log(`Vote ${voteId} is closed without execution`);
      }

      await fs.cp(omnibusPath, archivePath, { errorOnExist: true, recursive: true });
      await fs.rm(omnibusPath, { recursive: true });

      console.log(`Omnibus ${name} was archived to ${archivePath}`);
    }),
  );

defineTask("omnibus:build", "Build Solidity omnibus contract(s) for the given omnibus")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to build contracts for" })
  .setAction(
    lazy(async (taskArgs: { name: string }, hre: HardhatRuntimeEnvironment) => {
      const { name } = taskArgs;
      assertVoteAddresses(await resolveOmnibusDir(name));
      await buildOmnibusContracts(hre, name);
      console.log(fmt.success(`Omnibus contracts for "${name}" compiled successfully`));
    }),
  );

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
  .setAction(
    lazy(async (taskArgs: { name: string; broadcast: boolean }, hre: HardhatRuntimeEnvironment) => {
      const { name, broadcast = false } = taskArgs;
      assertVoteAddresses(await resolveOmnibusDir(name));
      const omnibus = await loadOmnibus(name);
      const defaultContractName = omnibus.hasDeployMethod() ? undefined : await findDefaultOmnibusContractName(name);

      const deployment = omnibus.getDeployment();

      if (deployment && Object.keys(deployment).length > 0) {
        const deployedAddresses = Object.fromEntries(
          Object.entries(deployment).map(([name, contract]) => [name, contract.address]),
        );
        throw new KnownError(`Omnibus contracts already deployed at ${JSON.stringify(deployedAddresses)}`);
      }

      if (broadcast && defaultContractName) {
        await validateDefaultOmnibusDeploymentCanBeRecorded(name);
      }

      await buildOmnibusContracts(hre, name);

      const client = broadcast
        ? await omnibusTaskDeps.createRpcClient(omnibus.network)
        : await prepareDevRpcClient(omnibus.network, hre);

      printBroadcastWarning(broadcast, omnibus.network);

      const deployedContracts = await withSender(hre, client, broadcast, async (deployer) => {
        console.log(`Network: ${client.getNetworkName()}`);
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Balance: ${await client.getBalance(deployer.address)}`);

        const deployMessage = `Deploy omnibus contract(s) on chain ${await client.viemClient.getChainId()}?`;
        if (broadcast) {
          await prompt.confirmByTypingOrAbort(deployMessage, omnibus.network);
        } else {
          await prompt.confirmOrAbort(deployMessage);
        }
        return deployOmnibusForLaunch(hre, client, omnibus, defaultContractName, { from: deployer.from });
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
      } else if (broadcast) {
        console.log(
          "Before recording this custom deployment, move the existing deploy callback to a named async function deploy.",
        );
        console.log("Import type DeployOmnibusContractCtx alongside Omnibus and use it for the function parameter.");
        console.log(
          "Paste these public deployments after that function; the cast preserves its authored contract types:",
        );
        console.log(renderCustomOmnibusDeployment(deployedContracts));
        console.log("Inside Omnibus.create({...}), use `deploy,` and `deployment: DEPLOYED_CONTRACTS,`.");
      }
    }),
  );

defineTask("omnibus:test", "Runs tests for the given omnibus at local node")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to test" })
  .addOption({ name: "forkBlock", description: FORK_BLOCK_DESCRIPTION, defaultValue: "" })
  .addFlag({ name: "skipAcceptance", description: "Skip post-execution acceptance checks" })
  .setAction(
    lazy(
      async (
        taskArgs: { name: string; forkBlock: string; skipAcceptance: boolean },
        hre: HardhatRuntimeEnvironment,
      ) => {
        const { name } = taskArgs;
        assertVoteAddresses(await resolveOmnibusDir(name));
        const omnibus = await loadOmnibus(name);
        const forkBlock = resolveForkBlock(taskArgs.forkBlock);
        const client = await prepareDevRpcClient(omnibus.network, hre, forkBlock);
        await omnibusTaskDeps.assertNodeOnRealChain(client, omnibus.network, forkBlock);
        const snapshotId = await client.snapshot();
        try {
          await prepareOmnibus(hre, client, omnibus);
          await printEvmScript(name, omnibus.getEvmScript());
          const stage = await omnibus.test(client, taskArgs.skipAcceptance ? undefined : runAcceptance);
          if (omnibus.upgrade && (stage === "not-launched" || stage === "voting")) {
            await omnibusTaskDeps.runSnapshots(
              client,
              async (hooks) => {
                await omnibus.test(client, undefined, hooks);
              },
              {
                createsVote: omnibus.voteId === undefined,
              },
            );
          }
        } finally {
          await client.revert(snapshotId);
        }
      },
    ),
  );

defineTask("omnibus:trace", "Trace the omnibus with given name and shows the execution trace")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .setAction(
    lazy(async (taskArgs: { name: string }, hre: HardhatRuntimeEnvironment) => {
      const { name } = taskArgs;
      const omnibus = await loadOmnibus(name);
      const client = await prepareDevRpcClient(omnibus.network, hre);
      await prepareOmnibus(hre, client, omnibus);

      console.log(`Tracing the omnibus "${name}" on "${omnibus.network}" network\n`);

      await omnibus.trace(client);
    }),
  );

export const multiTestDeps = {
  loadOmnibus,
  prepareLocalRpcNode,
  prepareOmnibus,
  runRepoTests,
  stopLocalRpcNode,
  createDevRpcClient,
  runImageInBackground,
  findContainerByName,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  localRpcNodeConnectIntervalMs: 2_000,
  localRpcNodeConnectTimeoutMs: 120_000,
};

export function getRepositorySuites(repo?: string): RepositorySuite[] {
  const repositories: RepositorySuite[] = ["core", "dual-governance", "scripts", "staking-modules", "stonks"];
  if (!repo) {
    return repositories;
  }
  const selected = repositories.find((repository) => repository === repo);
  if (!selected) {
    throw new KnownError(`Unsupported repo "${repo}". Expected one of: ${repositories.join(", ")}`);
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
  .addOption({ name: "forkBlock", description: FORK_BLOCK_DESCRIPTION, defaultValue: "" })
  .setAction(
    lazy(async (taskArgs: { name: string; repo: string; forkBlock: string }, hre: HardhatRuntimeEnvironment) => {
      const { name, repo } = taskArgs;
      const forkBlock = resolveForkBlock(taskArgs.forkBlock);
      const normalizedName = name || undefined;
      const normalizedRepo = repo || undefined;
      const repoNamesToTest = getRepositorySuites(normalizedRepo);
      const omnibus = normalizedName ? await multiTestDeps.loadOmnibus(normalizedName) : undefined;
      const network = omnibus?.network ?? "mainnet";
      const suites = repoNamesToTest.filter((repository) => SUITE_NETWORKS[repository].includes(network));
      const skipped = repoNamesToTest.filter((repository) => !suites.includes(repository));
      if (!suites.length) {
        throw new KnownError(`No ${network} regression suite in ${skipped.join(", ")}`);
      }
      if (skipped.length) {
        console.log(`Skipping ${skipped.join(", ")}: no ${network} regression suite`);
      }
      const node = await multiTestDeps.prepareLocalRpcNode(network, forkBlock);
      const stopOwnNode = async () => {
        if (node.startedByUs) {
          await multiTestDeps.stopLocalRpcNode();
        }
      };

      try {
        await node.client.withSnapshot(async () => {
          if (omnibus) {
            await multiTestDeps.prepareOmnibus(hre, node.client, omnibus);
            await omnibus.passOmnibus(node.client);
          } else {
            console.log("Omnibus name doesn't pass. Run tests without passing any omnibuses");
          }

          await runRepositorySuites(node.client, suites, (repository) =>
            multiTestDeps.runRepoTests(repository, network),
          );
        });
      } catch (error) {
        try {
          await stopOwnNode();
        } catch (stopError) {
          // the test failure is the actionable one, a failed cleanup only gets reported
          console.error(`Failed to stop the local RPC node: ${errorMessage(stopError)}`);
        }
        throw error;
      }
      await stopOwnNode();
    }),
  );

defineTask("omnibus:repo-image", "Prints the commit and image tag a regression repo is built from, as one JSON line")
  .addOption({
    name: "repo",
    description: "Name of the repo: core|scripts|dual-governance|staking-modules|stonks",
    defaultValue: "",
  })
  .setAction(
    lazy(async (taskArgs: { repo: string }) => {
      if (!taskArgs.repo) {
        throw new KnownError("--repo is required");
      }
      const [repository] = getRepositorySuites(taskArgs.repo);
      const image = await resolveRepoImage(repository, REPO_BRANCHES[repository]());
      console.log(JSON.stringify(image));
    }),
  );

type OmnibusLaunchParams = {
  name: string;
  broadcast: boolean;
};

defineTask("omnibus:launch", "Launch the omnibus with given name")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .addFlag({ name: "broadcast", description: "broadcast the transaction to the network" })
  .setAction(
    lazy(async (taskArgs: OmnibusLaunchParams, hre: HardhatRuntimeEnvironment) => {
      const { name, broadcast } = taskArgs;
      const omnibus = await loadOmnibus(name);

      if (omnibus.voteId !== undefined) {
        throw new KnownError(`The omnibus "${name}" already launched. Aborting...`);
      }
      const omnibusScriptPath = await getOmnibusScriptPath(name);
      if (broadcast) {
        renderVoteId(await fs.readFile(omnibusScriptPath, "utf-8"), 0n);
      }

      const client = broadcast
        ? await omnibusTaskDeps.createRpcClient(omnibus.network)
        : await prepareDevRpcClient(omnibus.network, hre);

      await prepareOmnibus(hre, client, omnibus);

      const description = await readOmnibusDescriptionFile(name);

      // the CID is computed locally, the upload waits for the broadcast confirmation
      const descriptionUrl = getUrlByCidV1(await calculateCid(description));
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

      printBroadcastWarning(broadcast, omnibus.network);

      const { receipt, voteId } = await withSender(hre, client, broadcast, async (pilot) => {
        const { ldo, tokenManager } = getGovernanceContracts(omnibus.network);
        const [chainId, nonce, ethBalance, ldoBalanceInitial] = await Promise.all([
          client.viemClient.getChainId(),
          client.getTransactionCount({ address: pilot.address }),
          client.getBalance(pilot.address),
          client.read(ldo, "balanceOf", [pilot.address]),
        ]);
        let ldoBalance = ldoBalanceInitial;

        if (client instanceof DevRpcClient && ldoBalance === 0n) {
          const spinner = createTimedSpinner("Preparing pilot for the test launch...");
          await setupLdoHolder(client, pilot.address);
          ldoBalance = await client.read(ldo, "balanceOf", [pilot.address]);
          spinner.succeed("Pilot was successfully prepared. Make sure account will heave enough LDO on launch");
          console.log();
        }

        console.log();

        console.log(`Pilot: ${fmt.address(pilot.address)}`);
        console.log(`    - nonce: ${nonce}`);
        console.log(`    - ETH balance: ${formatEther(ethBalance)}`);
        console.log(`    - LDO balance: ${formatEther(ldoBalance)}`);
        console.log();

        const launchMessage = `Proceed? The vote will be started via ${tokenManager.address} on chain ${chainId}`;
        if (broadcast) {
          await prompt.confirmByTypingOrAbort(launchMessage, omnibus.network);
          await omnibusTaskDeps.uploadDescription(name, description, false);
        } else {
          await prompt.confirmOrAbort(launchMessage);
        }

        return omnibusTaskDeps.startAragonVote(client, evmScript, voteDescription, { from: pilot.from });
      });

      console.log(`Vote id ${voteId} successfully launched:`);
      console.log(` - tx hash: ${receipt.transactionHash}`);
      console.log(` - block number: ${receipt.blockNumber}`);

      if (broadcast) {
        const source = await fs.readFile(omnibusScriptPath, "utf-8");
        await fs.writeFile(omnibusScriptPath, renderVoteId(source, voteId), "utf-8");
        console.log(`Saved voteId to ${path.relative(process.cwd(), omnibusScriptPath)}`);
      }

      if (!(await client.read(omnibus.getOmnibusContract(), "isValidVoteScript", [voteId]))) {
        throw new KnownError(`The script of vote ${voteId} doesn't match the omnibus contract`);
      }
      console.log(fmt.success(`The script of vote ${voteId} matches the omnibus contract`));
    }),
  );

defineTask("omnibus:pass-aragon-vote", "Adopt Aragon Vote with the given id; refuses an executed vote")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "voteId", description: "Aragon Vote id" })
  .setAction(
    lazy(async (taskArgs: { networkName: string; voteId: string }, hre: HardhatRuntimeEnvironment) => {
      const { networkName, voteId } = taskArgs;
      if (networkName !== "mainnet" && networkName !== "hoodi") {
        throw new KnownError(`Unknown network "${networkName}", expected mainnet or hoodi`);
      }
      const client = await prepareDevRpcClient(networkName, hre);

      const parsedVoteId = BigInt(voteId);
      const receipt = await passAragonVote(client, parsedVoteId);
      console.log(`Aragon vote with id ${parsedVoteId} was executed at block ${receipt.blockNumber}`);
    }),
  );

function printBroadcastWarning(broadcast: boolean, network: NetworkName) {
  const warning = broadcast
    ? `⚠️  "--broadcast" flag is set. Transaction will be sent to "${network}" network\n`
    : `⚠️  "--broadcast" flag is not set. Transaction will be run on a local dev RPC node\n`;
  console.log(chalk.bold.yellowBright(warning));
}

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
  const omnibusDir = await resolveOmnibusDir(name);
  const omnibusModule = await import(pathToFileURL(path.join(omnibusDir, `${name}.ts`)).href);
  const omnibus: Omnibus = omnibusModule.default;
  const [stage, networkDir] = path.relative(omnibusTaskDeps.getOmnibusesDir(), omnibusDir).split(path.sep);
  if (stage !== "examples" && networkDir !== omnibus.network) {
    throw new KnownError(`Omnibus "${name}" targets ${omnibus.network} but lives in ${stage}/${networkDir}`);
  }
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

/** Directories named `name` among `ongoing/<network>/`, `archive/<network>/` and `examples/`. */
async function findOmnibusDirs(name: string): Promise<string[]> {
  const omnibusesDir = omnibusTaskDeps.getOmnibusesDir();
  const candidates = [path.join(omnibusesDir, "examples", name)];
  for (const stage of ["ongoing", "archive"]) {
    const stageDir = path.join(omnibusesDir, stage);
    const networkDirs = (await isDirectory(stageDir)) ? await fs.readdir(stageDir) : [];
    candidates.push(...networkDirs.map((networkDir) => path.join(stageDir, networkDir, name)));
  }
  const omnibusDirs: string[] = [];
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      omnibusDirs.push(candidate);
    }
  }
  return omnibusDirs;
}

async function resolveOmnibusDir(name: string): Promise<string> {
  const omnibusDirs = await findOmnibusDirs(name);
  if (omnibusDirs.length === 0) {
    throw new KnownError(
      `Omnibus "${name}" not found in omnibuses/{ongoing,archive}/<network>/ or omnibuses/examples/`,
    );
  }
  if (omnibusDirs.length > 1) {
    throw new KnownError(`Omnibus "${name}" exists in several directories: ${omnibusDirs.join(", ")}`);
  }
  return omnibusDirs[0];
}

async function getOmnibusScriptPath(name: string): Promise<string> {
  return path.join(await resolveOmnibusDir(name), `${name}.ts`);
}

async function validateDefaultOmnibusDeploymentCanBeRecorded(name: string): Promise<void> {
  const source = await fs.readFile(await getOmnibusScriptPath(name), "utf-8");
  renderDefaultOmnibusDeployment(source, "0x0000000000000000000000000000000000000000");
}

async function recordDefaultOmnibusDeployment(omnibusScriptPath: string, address: Address): Promise<void> {
  const source = await fs.readFile(omnibusScriptPath, "utf-8");
  const updatedSource = renderDefaultOmnibusDeployment(source, address);
  await fs.writeFile(omnibusScriptPath, updatedSource, "utf-8");
}

interface Sender {
  address: Address;
  from: WriteContractOptions["from"];
}

// a dry run never decrypts the key: a transaction signed for a fork can be replayed on the real network
async function withSender<T>(
  hre: HardhatRuntimeEnvironment,
  client: RpcClient,
  broadcast: boolean,
  action: (sender: Sender) => Promise<T>,
): Promise<T> {
  const keystores = getKeystores(hre);
  if (broadcast) {
    const account = privateKeyToAccount(await keystores.unlock());
    return action({ address: account.address, from: account });
  }
  if (!(client instanceof DevRpcClient)) {
    throw new Error(`A dry run without "--broadcast" must run on a dev RPC node`);
  }
  const { address } = await keystores.select();
  await client.impersonate(address);
  try {
    return await action({ address, from: address });
  } finally {
    await client.stopImpersonating(address).catch((error: unknown) => {
      console.error(`Failed to stop impersonating ${address}: ${errorMessage(error)}`);
    });
  }
}

export function deployOmnibusForLaunch(
  hre: HardhatRuntimeEnvironment,
  client: RpcClient,
  omnibus: Omnibus,
  defaultContractName: string | undefined,
  txOptions: WriteContractOptions,
  padLength = 0,
) {
  return defaultContractName
    ? omnibus.deployOmnibusContract(hre.artifacts, client, defaultContractName, txOptions, { padLength })
    : omnibus.deployOmnibusContracts(hre.artifacts, client, txOptions, { padLength });
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
    await stopContainer(container, LOCAL_RPC_NODE_CONTAINER);
  }
}

async function prepareLocalRpcNode(network: NetworkName, forkBlock?: bigint): Promise<LocalRpcNode> {
  const name = LOCAL_RPC_NODE_CONTAINER;
  // the image starts `hardhat node` forking from the latest block; the pin goes through the CLI flag
  const cmd = forkBlock ? ["npx", "hardhat", "node", "--fork-block-number", forkBlock.toString()] : ["npm", "start"];
  const image = env.HH_NODE_IMAGE(network);

  const port = env.ETH_LOCAL_RPC_PORT();
  const localRpcUrl = getLocalRpcUrl(port);

  let runningNodeClient: DevRpcClient | undefined;
  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localRpcUrl}...`, 2));
    runningNodeClient = await multiTestDeps.createDevRpcClient(network, localRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localRpcUrl}\n`));
  } catch (error) {
    if (error instanceof KnownError) {
      throw error;
    }
    console.log(fmt.padded(`Failed to connect to local RPC: "${errorMessage(error).split("\n")[0]}"`, 4));
  }
  if (runningNodeClient) {
    await assertForkBlock(runningNodeClient, forkBlock);
    await omnibusTaskDeps.assertNodeOnRealChain(runningNodeClient, network, forkBlock);
    return { client: runningNodeClient, startedByUs: false };
  }

  const foreignContainer = await multiTestDeps.findContainerByName(name);
  if (foreignContainer) {
    throw new KnownError(
      `The node container "${name}" exists but is not reachable at ${localRpcUrl}. ` +
        `Stop it or wait until it is ready — the runner will not replace a container it does not own.`,
    );
  }

  logBlue(`Run ${name} container${forkBlock ? ` pinned to block ${forkBlock}` : ""}`);
  const container = await multiTestDeps.runImageInBackground(name, image, cmd, {
    Env: [`ETH_RPC_URL=${getRpcUrl(network)}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostIp: env.ETH_LOCAL_RPC_BIND_IP(), HostPort: port }] } },
  });

  try {
    const client = await connectToStartedNode(network, port);
    await assertForkBlock(client, forkBlock);
    return { client, startedByUs: true };
  } catch (error) {
    await stopContainer(container, name);
    throw error;
  }
}

/** A freshly started node opens its RPC port only after the fork is loaded — keep probing until the deadline */
async function connectToStartedNode(network: NetworkName, port: string): Promise<DevRpcClient> {
  const deadline = Date.now() + multiTestDeps.localRpcNodeConnectTimeoutMs;
  for (;;) {
    try {
      return await multiTestDeps.createDevRpcClient(network, getLocalRpcUrl(port));
    } catch (error) {
      if (error instanceof KnownError) {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw error;
      }
    }
    await multiTestDeps.sleep(multiTestDeps.localRpcNodeConnectIntervalMs);
  }
}

function resolveForkBlock(taskArg: string): bigint | undefined {
  if (!taskArg) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(taskArg)) {
    throw new KnownError(`Fork block must be a positive integer, got "${taskArg}"`);
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
    throw new KnownError(
      `The RPC node at ${client.getRpcUrl()} is at block ${blockNumber}, but fork block ${forkBlock} was requested. ` +
        `Restart the node at that block or drop the --fork-block pin.`,
    );
  }
  console.log(fmt.padded(`Fork pinned to block ${forkBlock}`, 2));
}

const STALE_NODE_BLOCKS = 50n;

/** A locally mined block or another network changes the block hash; storage cheats without a block are not detected. */
async function assertNodeOnRealChain(client: DevRpcClient, network: NetworkName, forkBlock?: bigint) {
  const nodeBlock = await client.viemClient.getBlock();
  const remoteClient = await createRpcClient(network);
  const remoteLatest = await remoteClient.getBlockNumber();
  const remoteBlock =
    nodeBlock.number <= remoteLatest ? await remoteClient.viemClient.getBlock({ blockNumber: nodeBlock.number }) : null;
  if (remoteBlock?.hash !== nodeBlock.hash) {
    throw new KnownError(
      `The RPC node at ${client.getRpcUrl()} is not on the ${network} chain at block ${nodeBlock.number}: ` +
        `it has local blocks or forks another network. Restart the node.`,
    );
  }
  const lag = remoteLatest - nodeBlock.number;
  if (forkBlock === undefined && lag > STALE_NODE_BLOCKS) {
    console.log(
      chalk.yellow(`⚠ The RPC node is ${lag} blocks behind ${network} latest; restart it to test the current state.`),
    );
  }
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
    if (error instanceof KnownError) {
      throw error;
    }
    console.log(fmt.padded(`Failed to connect to local RPC: "${errorMessage(error).split("\n")[0]}"`, 4));
    console.log(fmt.padded(`Trying to connect the in-process hardhat dev RPC node...`, 2));
  }
  if (standaloneClient) {
    await assertForkBlock(standaloneClient, forkBlock);
    return standaloneClient;
  }

  let networkConnection;
  try {
    networkConnection = await hre.network.connect({
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
  } catch (error) {
    throw new Error(
      `Failed to connect to local in-process dev network "default": ${errorMessage(error)}. ` +
        `Run without "--network" for local dev execution or start a standalone local RPC node.`,
    );
  }

  if (networkConnection.networkName !== "default" || networkConnection.networkConfig.type !== "edr-simulated") {
    throw new Error(
      `Unexpected fallback network "${networkConnection.networkName}" of type "${networkConnection.networkConfig.type}". ` +
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
    if (omnibus.voteId !== undefined) {
      throw new KnownError(
        `Vote ${omnibus.voteId} is launched: record its contract as "deployment.omnibus" instead of a local deploy`,
      );
    }
    console.log(fmt.padded("Compiling contracts before deploy...", 3));
    await buildOmnibusContracts(hre, omnibus.name, true);
    console.log(fmt.padded(fmt.success("Contracts compiled successfully"), 3));

    const [deployer] = await client.getAccounts();
    console.log(fmt.padded(`Deploying omnibus contracts using test account ${deployer}`, 3));
    deployment = await deployOmnibusForLaunch(hre, client, omnibus, defaultContractName, { from: deployer }, 4);
    console.log(fmt.padded(fmt.success(`All contracts successfully deployed:`), 3));
    for (const [name, contract] of Object.entries(deployment)) {
      console.log(`  - "${name}" - ${contract.label}[${contract.address}]`);
    }
  } else {
    throw new KnownError(
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

  await hre.tasks.getTask("build").run({
    quiet,
    noTests: true,
    files: omnibusSolidityFiles,
  });
}
