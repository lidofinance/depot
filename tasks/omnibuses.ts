import chalk from "chalk";
import { task } from "hardhat/config";

import { passAragonVote, setupLdoHolder, startAragonVote } from "../src/aragon-votes-tools";
import prompt from "../src/common/prompt";
import * as env from "../src/common/env";
import fs from "node:fs/promises";
import fmt from "../src/common/format";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Repos, runImageInBackground } from "../src/docker";
import { runRepoTests } from "./sub-tasks/containers";
import { formatEther } from "viem";
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
import { DevRpcClient, RpcClient } from "../src/network";
import { createTimedSpinner } from "../src/common/spinner";
import { ProposalStatus } from "../src/omnibuses/dual-governance";
import { logBlue } from "../src/common/color";
import { getGovernanceContracts } from "../src/omnibuses/governance-contracts";
import { generateOmnibusContractFile } from "../src/omnibuses/contract-generator";
import { getKeystores } from "../src/hardhat-keystores";
import { runHardhatTask } from "../src/hardhat/run-task";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const omnibusTaskBuilders: Array<ReturnType<typeof task>> = [];
type TaskAction = (taskArguments: any, hre: any) => any;

function asLazyAction(action: TaskAction) {
  return async () => ({ default: action });
}

function defineTask(...args: Parameters<typeof task>): any {
  const builder = task(...args) as any;
  const originalSetAction = builder.setAction.bind(builder) as (action: unknown) => any;
  builder.setAction = (action: unknown) => {
    if (typeof action === "function" && action.length > 0) {
      return originalSetAction(asLazyAction(action as TaskAction));
    }
    return originalSetAction(action);
  };
  omnibusTaskBuilders.push(builder);
  return builder;
}

defineTask("omnibus:create", "Create new empty omnibus from the template").setAction(async (_taskArgs: any) => {
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

  const omnibusesDir = path.join(__dirname, "..", "omnibuses");
  const newOmnibusDir = path.join(omnibusesDir, omnibusName);

  if (await files.touchDir(newOmnibusDir)) {
    throw new Error(`Omnibus ${newOmnibusDir} already exist`);
  }

  const templateDirName = "_omnibus_template";
  const templatePath = path.join(omnibusesDir, templateDirName);

  await fs.cp(templatePath, newOmnibusDir, { recursive: true });

  const omnibusDescriptionPath = path.join(newOmnibusDir, `${omnibusName}.md`);
  const omnibusScriptPath = path.join(newOmnibusDir, `${omnibusName}.ts`);
  const templateFileName = "_omnibus_template";

  await fs.rename(path.join(newOmnibusDir, `${templateFileName}.ts`), omnibusScriptPath);
  await fs.rename(path.join(newOmnibusDir, `${templateFileName}.md`), omnibusDescriptionPath);

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

  console.log(`Omnibus file was successfully created:`);
  console.log(`- Script file: ${omnibusScriptPath}`);
  console.log(`- Description file: ${omnibusDescriptionPath}`);
});

defineTask("omnibus:archive", "Move launched omnibus to archive folder")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to move to archive" })
  .setAction(async (taskArgs: any, hre: any) => {
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

    const omnibusPath = path.resolve(__dirname, "..", "omnibuses", name);
    const archivePath = path.resolve(__dirname, "..", "omnibuses", "_archive", omnibus.network, name);

    await fs.cp(omnibusPath, archivePath, { errorOnExist: true, recursive: true });
    await fs.rm(omnibusPath, { recursive: true });

    console.log(`Omnibus ${name} was archived to ${archivePath}`);
  });

defineTask("omnibus:contract", "Generate solidity omnibus contract from an existing omnibus script")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to convert" })
  .addOption({
    name: "contractName",
    description: "Name of the generated solidity contract",
    defaultValue: "",
  })
  .addOption({
    name: "formatter",
    description: "Formatter to use: prettier|forge|none",
    defaultValue: "prettier",
  })
  .addFlag({ name: "force", description: "overwrite existing contract file" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { name, contractName, formatter, force } = taskArgs;
    const normalizedContractName = contractName || undefined;
    const omnibus = await loadOmnibus(name);

    if (omnibus.hasDeployMethod() && !omnibus.getDeployment()) {
      console.log(
        fmt.padded(
          `Omnibus "${name}" has deploy() and doesn't contain deployment addresses. Resolving deployment contracts for generation...`,
          1,
        ),
      );
    }

    if (!["prettier", "forge", "none"].includes(formatter)) {
      throw new Error(`Unsupported formatter "${formatter}". Use: prettier, forge, none`);
    }

    const { generatedFilePath } = await generateOmnibusContractFile({
      hre,
      omnibus,
      omnibusName: name,
      contractName: normalizedContractName,
      force,
      formatter: formatter as "prettier" | "forge" | "none",
      rootDir: path.resolve(__dirname, ".."),
    });

    console.log(`Solidity contract generated: ${generatedFilePath}`);
  });

defineTask("omnibus:build", "Build Solidity omnibus contract(s) for the given omnibus")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to build contracts for" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { name } = taskArgs;
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

defineTask("omnibus:deploy", "Run deploy method on an omnibus script")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus script with the deploy() method to run" })
  .addFlag({ name: "broadcast", description: "broadcast the transaction to the network" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { name, broadcast = false } = taskArgs;
    const omnibus = await loadOmnibus(name);

    if (!omnibus.hasDeployMethod()) {
      throw new Error(`Omnibus "${name}" doesn't have deploy method`);
    }

    const deployment = omnibus.getDeployment();

    if (deployment) {
      const deployedAddresses = Object.fromEntries(
        Object.entries(deployment).map(([name, contract]) => [name, contract.address]),
      );
      throw new Error(`Omnibus contracts already deployed at ${JSON.stringify(deployedAddresses)}`);
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

    await prompt.confirm(`Deploy omnibus contract(s)?`);
    const deployedOmnibusContract = await omnibus.deployOmnibusContracts(hre.artifacts, client, { from: deployer });

    console.log(`Omnibus contract ${deployedOmnibusContract.label} was deployed at ${deployedOmnibusContract.address}`);
  });

defineTask("omnibus:test", "Runs tests for the given omnibus at local node")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to test" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { name } = taskArgs;
    const omnibus = await loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);
    await prepareOmnibus(hre, client, omnibus);
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
  .setAction(async (taskArgs: any, hre: any) => {
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
  .setAction(async (taskArgs: OmnibusLaunchParams, hre: any) => {
    const { name } = taskArgs;
    const omnibus = await loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);
    await prepareOmnibus(hre, client, omnibus);

    console.log(`Tracing the omnibus "${name}" on "${omnibus.network}" network\n`);

    await omnibus.trace(client);
  });

defineTask("omnibus:multi-test", "Runs tests for the given omnibus cross repo")
  .addOption({
    name: "name",
    description: "Name of the omnibus to run",
    defaultValue: "",
  })
  .addOption({
    name: "repo",
    description: "Name of the repo for test: depot|core|scripts|dual-governance",
    defaultValue: "",
  })
  .addOption({
    name: "pattern",
    description: "Pattern for test run",
    defaultValue: "",
  })
  .addFlag({ name: "mountTests", description: "Mount test files from /mount/<repo> to external repo test dir" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { name, repo, pattern, mountTests } = taskArgs;
    const normalizedName = name || undefined;
    const normalizedRepo = repo || undefined;
    const normalizedPattern = pattern || undefined;
    let client: DevRpcClient;
    let network: NetworkName;

    let snapshotId;
    if (normalizedName) {
      const omnibus = await loadOmnibus(normalizedName);

      network = omnibus.network;
      client = await prepareLocalRpcNode(omnibus.network);
      snapshotId = await client.snapshot();

      await prepareOmnibus(hre, client, omnibus);
      await omnibus.passOmnibus(client);
    } else {
      console.log("Omnibus name doesn't pass. Run tests without passing any omnibuses");
      network = "mainnet";
      client = await prepareLocalRpcNode("mainnet");
      snapshotId = await client.snapshot();
    }

    try {
      const repoNamesToTest: Exclude<Repos, "depot">[] = [];
      if (!normalizedRepo || normalizedRepo === "core") {
        repoNamesToTest.push("core");
      }
      if (!normalizedRepo || normalizedRepo === "dual-governance") {
        repoNamesToTest.push("dual-governance");
      }
      if (!normalizedRepo || normalizedRepo === "scripts") {
        repoNamesToTest.push("scripts");
      }

      const hideDebug = repoNamesToTest.length > 1;

      const testRunResults = await Promise.all(
        repoNamesToTest.map(
          (repo) =>
            new Promise<{ status: "fulfilled"; result: any } | { status: "rejected"; error: any }>(async (resolve) => {
              try {
                const res = await runRepoTests(repo, normalizedPattern, hideDebug, mountTests);
                resolve({ status: "fulfilled", result: res });
              } catch (error) {
                console.error(`Tests run for repo "${repo}" has failed with error: ${error}`);
                resolve({ status: "rejected", error: error });
              }
            }),
        ),
      );

      for (let i = 0; i < repoNamesToTest.length; ++i) {
        const repoName = repoNamesToTest[i];
        const testRunResult = testRunResults[i];
        if (testRunResult.status === "rejected") {
          console.log(`Tests run for repo "${repoName}" has finished with error: ${testRunResult.error}`);
        } else {
          console.log(`Tests run for repo "${repoName} has finished successfully"`);
        }
      }
    } finally {
      await client.revert(snapshotId);
    }
  });

type OmnibusLaunchParams = {
  name: string;
  broadcast: boolean;
};

defineTask("omnibus:launch", "Launch the omnibus with given name")
  .addPositionalArgument({ name: "name", description: "Name of the omnibus to run" })
  .addFlag({ name: "broadcast", description: "broadcast the transaction to the network" })
  .setAction(async (taskArgs: OmnibusLaunchParams, hre: any) => {
    const { name, broadcast } = taskArgs;
    const omnibus = await loadOmnibus(name);

    if (omnibus.voteId || omnibus.launchedAt || omnibus.executedAt) {
      throw new Error(`The omnibus "${omnibus.voteId}" already lunched. Aborting...`);
    }

    const client = broadcast ? await createRpcClient(omnibus.network) : await prepareDevRpcClient(omnibus.network, hre);

    await prepareOmnibus(hre, client, omnibus);

    const descriptionFilePath = path.join(__dirname, "..", "omnibuses", name, `${name}.md`);
    const description = await fs.readFile(descriptionFilePath, { encoding: "utf-8" });

    const descriptionUrl = await uploadDescription(name, description, false);
    const evmScript = omnibus.getEvmScript();

    console.log();

    console.log(chalk.bold.underline("Omnibus calls:\n"));
    console.log(omnibus.format({ padLength: 1 }));
    console.log();

    console.log(chalk.bold.underline("Omnibus Aragon Vote description:\n"));
    console.log(chalk.gray(omnibus.formatDescription(descriptionUrl)));
    console.log();

    console.log(chalk.bold.underline("Omnibus IPFS description:\n"));
    console.log(chalk.gray(description));
    console.log();

    console.log(chalk.bold.underline("Omnibus EVM script:\n"));
    console.log(chalk.greenBright(evmScript));
    console.log();

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
    let [nonce, ethBalance, ldoBalance] = await Promise.all([
      client.getTransactionCount({ address: pilot.address }),
      client.getBalance(pilot.address),
      client.read(ldo, "balanceOf", [pilot.address]),
    ]);

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

    const { receipt, voteId } = await startAragonVote(client, evmScript, omnibus.formatDescription(), {
      from: pilot,
    });

    console.log(`Vote id ${voteId} successfully launched:`);
    console.log(` - tx hash: ${receipt.transactionHash}`);
    console.log(` - block number: ${receipt.blockNumber}`);
  });

defineTask("omnibus:pass-aragon-vote", "Adopt Aragon Vote with the given id")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "voteId", description: "Aragon Vote id" })
  .setAction(async (taskArgs: any, hre: any) => {
    const { networkName, voteId } = taskArgs;
    const client = await prepareDevRpcClient(networkName, hre);

    const parsedVoteId = BigInt(voteId);
    const receipt = await passAragonVote(client, parsedVoteId);
    console.log(`Aragon vote with id ${parsedVoteId} was executed at block ${receipt.blockNumber}`);
  });

defineTask("omnibus:schedule-proposal", "Schedule proposal into DG")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "proposalId", description: "Proposal id" })
  .setAction(async (taskArgs: any, hre: any) => {
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
      await client.increaseTime(submittedAt - afterSubmitDelay + 1);
    }
    await client.write(dualGovernance, "scheduleProposal", [parsedProposalId], { from: stranger });
  });

defineTask("omnibus:execute-proposal", "Executes proposal with a given id")
  .addPositionalArgument({ name: "networkName", description: "Network of the vote" })
  .addPositionalArgument({ name: "proposalId", description: "Proposal id" })
  .setAction(async (taskArgs: any, hre: any) => {
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
      await client.increaseTime(scheduledAt - afterScheduleDelay + 1);
    }
    const executeReceipt = await client.write(timelock, "execute", [parsedProposalId], { from: stranger });
    console.log(`Proposal with id ${parsedProposalId} successfully executed at block ${executeReceipt.blockNumber}`);
    console.log(` - tx hash: ${executeReceipt.transactionHash}`);
  });

async function loadOmnibus(name: string): Promise<Omnibus> {
  const omnibusModulePath = path.resolve(__dirname, "..", "omnibuses", name, `${name}.ts`);
  const omnibusModule = await import(pathToFileURL(omnibusModulePath).href);
  const omnibus: Omnibus = omnibusModule.default;
  omnibus.setName(name);
  return omnibus;
}

async function prepareLocalRpcNode(network: NetworkName) {
  const name = "hh-rpc-node";
  const cmd = ["npm", "start"];
  const image = `ghcr.io/lidofinance/hardhat-node:2.26.0`;

  const port = env.ETH_LOCAL_RPC_PORT();
  const localRpcUrl = getLocalRpcUrl(port);

  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localRpcUrl}...`, 2));
    const client = await createDevRpcClient(network, localRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localRpcUrl}\n`));
    return client;
  } catch (error) {
    console.log(fmt.padded(`Failed to connect to local RPC: "${(error as Error).message.split("\n")[0]}"`, 4));
  }

  logBlue(`Run ${name} container`);
  await runImageInBackground(name, image, cmd, false, {
    Env: [`ETH_RPC_URL=${getRpcUrl(network)}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostPort: port }] } },
  });

  return createDevRpcClient(network, getLocalRpcUrl(port));
}

async function prepareDevRpcClient(networkName: NetworkName, hre: HardhatRuntimeEnvironment) {
  console.log("⏳Preparing local dev RPC client...");
  const localDevRpcUrl = getLocalRpcUrl(env.ETH_LOCAL_RPC_PORT());
  const targetRpcUrl = getRpcUrl(networkName);

  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localDevRpcUrl}...`, 2));
    const standaloneClient = await createDevRpcClient(networkName, localDevRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localDevRpcUrl}\n`));
    return standaloneClient;
  } catch (error) {
    console.log(fmt.padded(`Failed to connect to local RPC: "${(error as Error).message.split("\n")[0]}"`, 4));
    console.log(fmt.padded(`Trying to connect the in-process hardhat dev RPC node...`, 2));
  }

  const connectLocalDevNetwork = async () => {
    const networkApi = (hre as any).network;
    const networkManagerApi = (hre as any).networkManager;
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
        },
      },
    });
  };

  let networkConnection: any;
  try {
    networkConnection = await connectLocalDevNetwork();
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

  const builtinHardhatClient = await createDevRpcClient(networkName, networkConnection.provider);
  const providerRpcUrl = builtinHardhatClient.getRpcUrl();
  if (providerRpcUrl && !providerRpcUrl.includes("localhost") && !providerRpcUrl.includes("127.0.0.1")) {
    throw new Error(
      `In-process dev RPC fallback resolved to a non-local provider (${providerRpcUrl}). ` +
        `Run without "--network" or start local RPC explicitly.`,
    );
  }

  console.log(fmt.success(`Successfully connected to the in-process hardhat dev RPC node\n`));

  return builtinHardhatClient;
}

export async function prepareOmnibus(
  hre: HardhatRuntimeEnvironment,
  client: DevRpcClient | RpcClient,
  omnibus: Omnibus,
) {
  console.log(`⏳Preparing omnibus "${omnibus.name}"...`);

  if (omnibus.hasDeployMethod()) {
    console.log(`Omnibus "${omnibus.name}" has deploy() method, preparing contracts required for omnibus launch...`);
    let deployment = omnibus.getDeployment();
    if (deployment) {
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
      deployment = await omnibus.deployOmnibusContracts(hre.artifacts, client, { from: deployer }, { padLength: 4 });
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
    }
  }
  console.log(fmt.success("Omnibus prepared\n"));

  return omnibus;
}

async function buildOmnibusContracts(hre: HardhatRuntimeEnvironment, omnibusName: string, quiet = false) {
  const omnibusDirPath = path.resolve(__dirname, "..", "omnibuses", omnibusName);

  const omnibusSolidityFiles = await fs
    .readdir(omnibusDirPath)
    .then((entries) => entries.filter((entry) => entry.endsWith(".sol") && !entry.endsWith(".t.sol")))
    .then((entries) => entries.map((entry) => path.relative(process.cwd(), path.join(omnibusDirPath, entry))));

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
  const omnibusDirPath = path.resolve(__dirname, "..", "omnibuses", omnibusName);

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
