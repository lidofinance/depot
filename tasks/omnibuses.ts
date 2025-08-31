import chalk from "chalk";
import { task } from "hardhat/config";
import * as types from "hardhat/internal/core/params/argumentTypes";

import { passAragonVote, setupLdoHolder, startAragonVote } from "../src/aragon-votes-tools";
import prompt from "../src/common/prompt";
import * as env from "../src/common/env";
import { isKnownError } from "../src/common/errors";
import fs from "node:fs/promises";
import fmt from "../src/common/format";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findContainerByName, RPC_NODE_SETTING, stopContainer } from "../src/docker";
import { runCoreTests, runScriptsTests, runDgTests } from "./sub-tasks/containers";
import { formatEther } from "viem";
import { createDevRpcClient, createRpcClient, getChainIdByNetworkName, NetworkName } from "../src/network/network";
import { privateKeyToAccount } from "viem/accounts";
import format from "../src/common/format";
import { getLidoContracts } from "../src/contracts/contracts";
import { Omnibus } from "../src/omnibuses/omnibus";
import path from "node:path";
import { getRpcUrl } from "../src/network/network";
import { TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import files from "../src/common/files";
import { uploadDescription } from "./sub-tasks/upload-description";
import { DevRpcClient, RpcClient } from "../src/network";
import { createTimedSpinner } from "../src/common/spinner";
import { ProposalStatus } from "../src/omnibuses/dual-governance";

task("omnibus:scaffold", "Create new empty omnibus from the template").setAction(async ({}) => {
  const network: NetworkName = await prompt.select("Choose the network:", [
    { title: "Mainnet", value: "mainnet" },
    { title: "Holesky", value: "holesky" },
    { title: "Hoodi", value: "hoodi" },
  ]);

  const omnibusName = await prompt.text(
    `Enter the name of the omnibus in the format "yyyy_dd_mm_some_optional_info" (for example 2025_12_31_happy_new_year_omni):`,
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

task("omnibus:archive")
  .addPositionalParam<string>("name", "Name of the omnibus to move to archive", undefined, types.string)
  .setAction(async ({ name }, hre) => {
    const omnibus = loadOmnibus(name);

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

function omnibusNameToDescriptionHeader(omnibusName: string) {
  return omnibusName
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/(\d{4}) (\d{2}) (\d{2})/g, "$1-$2-$3");
}

task("omnibus:deploy", "Deploy onchain omnibus contract")
  .addPositionalParam<string>("name", "Name of the onchain omnibus to deploy", undefined, types.string, false)
  .setAction(async ({ name }, hre) => {
    const omnibus = loadOmnibus(name);

    const omnibusContractInfo = omnibus.getOmnibusContractInfo();

    if (!omnibusContractInfo) {
      throw new Error(`Omnibus doesn't contain contract to deploy`);
    }

    if (omnibusContractInfo.address) {
      throw new Error(
        `Omnibus contract ${omnibusContractInfo.name} already deployed at address ${omnibusContractInfo.address}`,
      );
    }

    await hre.run(TASK_COMPILE);

    const client = await createRpcClient(omnibus.network);
    const deployer = privateKeyToAccount(await hre.keystores.unlock());

    console.log(`Network: ${client.getNetworkName()}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${await client.getBalance(deployer.address)}`);

    await prompt.confirm(`Deploy omnibus contract?`);
    const deployedOmnibusContract = await omnibus.deployOmnibusContract(hre.artifacts, client, { from: deployer });

    console.log(`Omnibus contract ${deployedOmnibusContract.label} was deployed at ${deployedOmnibusContract.address}`);
  });

task("omnibus:test", "Runs tests for the given omnibus at local node")
  .addPositionalParam<string>("name", "Name of the omnibus to test", undefined, types.string, false)
  .addOptionalParam<number>("blockNumber", "Block number to spawn rpc node on", undefined, types.int)
  .setAction(async ({ name }, hre) => {
    const omnibus = loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);
    await prepareOmnibus(hre, client, omnibus);
    await omnibus.test(client);
  });

task("omnibus:trace", "Trace the omnibus with given name and shows the execution trace")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .setAction(async ({ name }: OmnibusLaunchParams, hre) => {
    const omnibus = loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);
    await prepareOmnibus(hre, client, omnibus);

    console.log(`Tracing the omnibus "${name}" on "${omnibus.network}" network\n`);

    await omnibus.trace(client);
  });

task("omnibus:multi-test", "Runs tests for the given omnibus cross repo")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<string>("repo", "Name of the repo for test: depot|core|scripts", undefined, types.string)
  .addOptionalParam<string>("pattern", "Pattern for test run", undefined, types.string)
  .addOptionalParam<boolean>(
    "mountTests",
    "Mount test files from /mount/<repo> to external repo test dir",
    false,
    types.boolean,
  )
  .addOptionalParam<boolean>(
    "skipVoting",
    "Restart hardhat-node container if it was running before task",
    false,
    types.boolean,
  )
  .addOptionalParam<boolean>("hideDebug", "Hide container logs and come extra information", false, types.boolean)
  .setAction(async ({ name, repo, pattern, mountTests, skipVoting, hideDebug }, hre) => {
    const omnibus = loadOmnibus(name);

    env.checkEnvVars();

    // if (!repo || repo === "depot") {
    //   await runDepotTests("_example_omnibus", hideDebug);
    // }

    await Promise.all([
      (!repo || repo === "core") && runCoreTests(omnibus, pattern, hideDebug, mountTests),
      (!repo || repo === "scripts") && runScriptsTests(omnibus, pattern, hideDebug, mountTests),
      (!repo || repo === "dual-governance") && runDgTests(omnibus, pattern, hideDebug, mountTests),
    ]);
  });

type OmnibusLaunchParams = {
  name: string;
  broadcast: boolean;
};

task("omnibus:launch", "Launch the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addFlag("broadcast", "broadcast the transaction to the network")
  .setAction(async ({ name, broadcast }: OmnibusLaunchParams, hre) => {
    const omnibus = loadOmnibus(name);

    if (omnibus.executedAt) {
      throw new Error(`The omnibus "${omnibus.voteId}" already executed. Aborting...`);
    }

    const client = broadcast ? await createRpcClient(omnibus.network) : await prepareDevRpcClient(omnibus.network, hre);

    await prepareOmnibus(hre, client, omnibus);

    const descriptionFilePath = path.join(__dirname, "..", "omnibuses", name, `${name}.md`);
    const description = await fs.readFile(descriptionFilePath, { encoding: "utf-8" });

    const descriptionUrl = await uploadDescription(name, description, false);

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
    console.log(chalk.greenBright(omnibus.getEvmScript()));
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

    const pilot = privateKeyToAccount(await hre.keystores.unlock());

    const { ldo } = getLidoContracts(omnibus.network);
    let [nonce, ethBalance, ldoBalance] = await Promise.all([
      client.viemClient.getTransactionCount({ address: pilot.address }),
      client.viemClient.getBalance({ address: pilot.address }),
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

    const { receipt, voteId } = await startAragonVote(client, omnibus.getEvmScript(), omnibus.formatDescription(), {
      from: pilot,
    });

    console.log(`Vote id ${voteId} successfully launched:`);
    console.log(` - tx hash: ${receipt.transactionHash}`);
    console.log(` - block number: ${receipt.blockNumber}`);
  });

task("omnibus:pass-aragon-vote", "Adopt Aragon Vote with the given id")
  .addPositionalParam<number>("networkName", "Network of the vote", undefined, types.string, false)
  .addPositionalParam<number>("voteId", "Aragon Vote id", undefined, types.bigint, false)
  .setAction(async ({ networkName, voteId }, hre) => {
    const client = await prepareDevRpcClient(networkName, hre);

    const receipt = await passAragonVote(client, voteId);
    console.log(`Aragon vote with id ${voteId} was executed at block ${receipt.blockNumber}`);
  });

task("omnibus:schedule-proposal", "Schedule proposal into DG")
  .addPositionalParam<number>("networkName", "Network of the vote", undefined, types.string, false)
  .addPositionalParam<number>("proposalId", "Proposal id", undefined, types.bigint, false)
  .setAction(async ({ networkName, proposalId }, hre) => {
    const client = await prepareDevRpcClient(networkName, hre);

    const { emergencyProtectedTimelock, dualGovernance } = getLidoContracts(networkName);
    const [[stranger], chainTime, afterSubmitDelay, proposal] = await Promise.all([
      client.getAccounts(),
      client.getChainTime(),
      client.read(emergencyProtectedTimelock, "getAfterSubmitDelay", []),
      client.read(emergencyProtectedTimelock, "getProposalDetails", [proposalId]),
    ]);

    if (proposal.status !== ProposalStatus.Submitted) {
      throw new Error(`Unexpected proposal with id ${proposalId} in a wrong state: ${ProposalStatus.Submitted}`);
    }

    const submittedAt = proposal.submittedAt;
    if (chainTime < submittedAt + afterSubmitDelay) {
      await client.increaseTime(submittedAt - afterSubmitDelay + 1);
    }
    await client.write(dualGovernance, "scheduleProposal", [proposalId], { from: stranger });
  });

task("omnibus:execute-proposal", "Executes proposal with a given id")
  .addPositionalParam<number>("networkName", "Network of the vote", undefined, types.string, false)
  .addPositionalParam<number>("proposalId", "Proposal id", undefined, types.bigint, false)
  .setAction(async ({ networkName, proposalId }, hre) => {
    const client = await prepareDevRpcClient(networkName, hre);

    const { emergencyProtectedTimelock, dualGovernance } = getLidoContracts(networkName);
    const [[stranger], chainTime, afterScheduleDelay, proposal] = await Promise.all([
      client.getAccounts(),
      client.getChainTime(),
      client.read(emergencyProtectedTimelock, "getAfterScheduleDelay", []),
      client.read(emergencyProtectedTimelock, "getProposalDetails", [proposalId]),
    ]);

    if (proposal.status !== ProposalStatus.Scheduled) {
      throw new Error(`Unexpected proposal with id ${proposalId} in a wrong state: ${ProposalStatus.Submitted}`);
    }

    const scheduledAt = proposal.scheduledAt;
    if (chainTime < scheduledAt + afterScheduleDelay) {
      await client.increaseTime(scheduledAt - afterScheduleDelay + 1);
    }
    await client.write(emergencyProtectedTimelock, "execute", [proposalId], { from: stranger });
    console.log(`Proposal with id ${proposalId} successfully executed`);
  });

task("rpc:stop", "Stop local rpc node container").setAction(async () => {
  env.checkEnvVars();

  try {
    const settings = Object.values(RPC_NODE_SETTING);
    chalk.bold.green(`Stopping container ${settings.map(({ name }) => name).join(",")} `);
    const container = await Promise.all(settings.map(async ({ name }) => await findContainerByName(name)));

    const activeContainers = container.filter((container) => container !== null);
    const activeNames = settings.filter((_, ind) => activeContainers[ind] !== null);

    await Promise.all(activeContainers.map((container, ind) => stopContainer(container, activeNames[ind].name, true)));
    chalk.bold.green(`Stopped all active containers: ${activeContainers.join(",")} `);
    await prompt.sigint();
  } catch (err) {
    console.error(err);
    if (!isKnownError(err)) {
      throw err;
    }
    console.error(err.message);
  }
});

function loadOmnibus(name: string) {
  const omnibus: Omnibus = require(`../omnibuses/${name}/${name}.ts`).default;
  omnibus.setName(name);
  return omnibus;
}

async function prepareDevRpcClient(networkName: NetworkName, hre: HardhatRuntimeEnvironment) {
  console.log("⏳Preparing local dev RPC client...");
  const localDevRpcUrl = env.LOCAL_ETH_RPC_URL();

  try {
    console.log(fmt.padded(`Trying to connect to the local RPC node at: ${localDevRpcUrl}...`, 2));
    const standaloneClient = await createDevRpcClient(networkName, localDevRpcUrl);
    console.log(fmt.success(`Successfully connected to the RPC node at ${localDevRpcUrl}\n`));
    return standaloneClient;
  } catch (error) {
    console.log(fmt.padded(`Failed to connect to local RPC: "${(error as Error).message.split("\n")[0]}"`, 4));
    console.log(fmt.padded(`Trying to connect the in-process hardhat dev RPC node...`, 2));
  }

  hre.network.config.chainId = getChainIdByNetworkName(networkName);
  const builtinHardhatClient = await createDevRpcClient(networkName, hre.network.provider);

  await builtinHardhatClient.reset({
    jsonRpcUrl: getRpcUrl(networkName),
  });

  console.log(fmt.success(`Successfully connected to the in-process hardhat dev RPC node\n`));

  return builtinHardhatClient;
}

async function prepareOmnibus(hre: HardhatRuntimeEnvironment, client: DevRpcClient | RpcClient, omnibus: Omnibus) {
  const omnibusContractInfo = omnibus.getOmnibusContractInfo();
  console.log(`⏳Preparing omnibus "${omnibus.name}"...`);
  if (omnibusContractInfo) {
    console.log(fmt.padded(`Preparing contract "${omnibusContractInfo.name}"...`, 1));
    if (omnibusContractInfo.address) {
      console.log(
        fmt.padded(
          fmt.success(
            `Omnibus contract "${omnibusContractInfo.name}" already deployed on ${omnibus.network} at address ${omnibusContractInfo.address}`,
          ),
          1,
        ),
      );
    } else if (client instanceof DevRpcClient) {
      console.log(
        fmt.padded(
          `Omnibus contract "${omnibusContractInfo.name}" hasn't deployed. Deploying on the dev RPC node...`,
          2,
        ),
      );
      console.log(fmt.padded("Compiling contracts before deploy...", 3));
      const res = await hre.run(TASK_COMPILE, { quiet: true });
      console.log(fmt.padded(fmt.success("Contracts compiled successfully"), 3));

      const [deployer] = await client.getAccounts();
      console.log(fmt.padded(`Deploying omnibus contracts using test account ${deployer}`, 3));
      await omnibus.deployOmnibusContract(hre.artifacts, client, { from: deployer }, { padLength: 4 });
      console.log(fmt.padded(fmt.success(`All contracts successfully deployed `), 3));
    } else {
      throw new Error(
        `Omnibus contract ${omnibusContractInfo.name} was not deployed. Use "omnibus:deploy <omnibus_name> --broadcast" command to deploy it before omnibus launch`,
      );
    }

    console.log(fmt.padded(`Loading and validating omnibus calls from the contract...`, 2));
    await omnibus.loadAndValidateOmnibusContractCalls(client);
    console.log(fmt.padded(fmt.success(`Omnibus calls successfully validated`), 2));
  }
  console.log(fmt.success("Omnibus prepared\n"));

  return omnibus;
}
