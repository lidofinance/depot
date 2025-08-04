import chalk from "chalk";
import { task } from "hardhat/config";
import * as types from "hardhat/internal/core/params/argumentTypes";

import prompt from "../src/common/prompt";
import * as env from "../src/common/env";
import { isKnownError } from "../src/common/errors";
import fs from "node:fs/promises";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findContainerByName, RPC_NODE_SETTING, stopContainer } from "../src/docker";
import { runCoreTests, runScriptsTests, runDgTests } from "./sub-tasks/containers";
import { formatEther } from "viem";
import { createDevRpcClient, createRpcClient, getChainIdByNetworkName, NetworkName } from "../src/network/network";
import { privateKeyToAccount } from "viem/accounts";
import format from "../src/common/format";
import { getLidoContracts } from "../src/contracts/contracts";
import { dryRunOmnibus } from "../src/omnibuses/tools/dry-run-omnibus";
import { Omnibus } from "../src/omnibuses/omnibus";
import path from "node:path";
import { getRpcUrl } from "../src/network/network";

task("omnibus:scaffold", "Create omnibus and spec filed from template").setAction(async ({}) => {
  const network: NetworkName = await prompt.select("Choose the network:", [
    { title: "Mainnet", value: "mainnet" },
    { title: "Holesky", value: "holesky" },
  ]);
  const omnibusName = await prompt.text("Enter the name of the omnibus");

  if (omnibusName.length === 0) {
    throw new Error("Name can't be empty");
  }

  if (!/^[a-zA-Z0-9_]+$/.test(omnibusName)) {
    throw new Error("Invalid name. Omnibus name may contain only letters, digits and _");
  }
  const omnibusesDir = path.join(__dirname, "..", "omnibuses");

  const omnibusFilePath = path.join(omnibusesDir, `${omnibusName}.ts`);

  await fs.writeFile(omnibusFilePath, omnibusTemplate(network).trimStart(), { encoding: "utf-8" });

  console.log(`Omnibus file was successfully created: ${omnibusFilePath}`);
});

task("omnibus:test", "Runs tests for the given omnibus at local node")
  .addPositionalParam<string>("name", "Name of the omnibus to test", undefined, types.string, false)
  .addOptionalParam<number>("blockNumber", "Block number to spawn rpc node on", undefined, types.int)
  .setAction(async ({ name }, hre) => {
    const omnibus = loadOmnibus(name);

    const client = await prepareDevRpcClient(omnibus.network, hre);
    try {
      const omni = await loadOmnibus(name);
      await omni.test(client);
    } catch (err) {
      console.error(err);
    }
  });

task("omnibus:inspect", "Dry run the omnibus with given name and shows the execution trace")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .setAction(async ({ name }: OmnibusRunParams, hre) => {
    env.checkEnvVars();

    const omnibus = loadOmnibus(name);
    const client = await prepareDevRpcClient(omnibus.network, hre);

    console.log(`Dry-run the omnibus ${name} on "${omnibus.network}" network\n`);

    await dryRunOmnibus(client, omnibus);
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

type OmnibusRunParams = {
  name: string;
};

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .setAction(async ({ name }: OmnibusRunParams, hre) => {
    try {
      const omnibus = await loadOmnibus(name);

      env.checkEnvVars();

      const pilot = privateKeyToAccount(await hre.keystores.unlock());

      const { ldo } = getLidoContracts(omnibus.network);
      const client = await createRpcClient(omnibus.network);
      const [nonce, ethBalance, ldoBalance] = await Promise.all([
        client.viemClient.getTransactionCount({ address: pilot.address }),
        client.viemClient.getBalance({ address: pilot.address }),
        client.read(ldo, "balanceOf", [pilot.address]),
      ]);
      console.log(`Pilot: ${format.address(pilot.address)}`);
      console.log(`    - nonce: ${nonce}`);
      console.log(`    - ETH balance: ${formatEther(ethBalance)}`);
      console.log(`    - LDO balance: ${formatEther(ldoBalance)}`);
      console.log();

      // if (ldoBalance === 0n) {
      //   throw new Error("Launch is not possible. Pilot address has 0 LDO.");
      // }

      // const testClient = await createDevRpcClient(omnibus.network, hre.network.provider);
      // await simulateOmnibus(testClient, omnibus);
      console.log("Omnibus summary:");
      console.log(omnibus.formatSummary("", 1));
      console.log();

      console.log("Omnibus EVM script:");
      console.log(omnibus.script);
      console.log();

      console.log("Omnibus details:");
      console.log(omnibus.format({ padLength: 1 }));

      await prompt.confirm(`Submit tx to start vote with given actions?`);

      // await runOmnibus(name, omnibus, hre, rpc, testAccount);

      // await prompt.sigint();
    } catch (err) {
      if (!isKnownError(err)) {
        throw err;
      }
      console.error(err.message);
    }
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
  const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;

  if (omnibus.executedOn) {
    throw new Error(`The omnibus "${omnibus.voteId}" already executed. Aborting...`);
  }
  return omnibus;
}

async function prepareDevRpcClient(networkName: NetworkName, hre: HardhatRuntimeEnvironment) {
  try {
    const rpcUrl = "http://localhost:8545";
    const standaloneClient = await createDevRpcClient(networkName, rpcUrl);
    console.log(`Connected to the RPC node at ${rpcUrl}\n`);
    return standaloneClient;
  } catch {}

  hre.network.config.chainId = getChainIdByNetworkName(networkName);
  const builtinHardhatClient = await createDevRpcClient(networkName, hre.network.provider);

  await builtinHardhatClient.reset({
    jsonRpcUrl: getRpcUrl(networkName),
  });

  console.log(`Successfully connected to the Hardhat RPC node\n`);

  return builtinHardhatClient;
}

const omnibusTemplate = (network: NetworkName) => `
import { assert } from "chai";
import { Omnibus } from "../src/omnibuses/omnibus";

const description = \`
Omnibus description to upload to IPFS
\`

export default Omnibus.create({
  network: "${network}",
  description,
  calls: ({ contracts, blueprints }) => [
    // Put omnibus calls here
  ],
  test: async ({ passOmnibus, passProposals, checks }) => {
    // 1. Collect required data before omnibus executed
    
    const { submittedProposalIds } = await passOmnibus();

    // 2. Check state after Aragon vote is executed

    // 3. Collect required data before DG proposals executed (if needed) 

    // 4. Execute DG proposal submitted by the Aragon voting
    
    await passProposals(submittedProposalIds);

    // 5. Validate state after proposals executed
  }
})
`;
