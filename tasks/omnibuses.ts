import chalk from "chalk";
import { task } from "hardhat/config";
import * as types from "hardhat/internal/core/params/argumentTypes";

import votes from "../src/votes";
import { RpcNodeName } from "../src/rpcs";
import traces from "../src/traces";
import prompt from "../src/common/prompt";
import env from "../src/common/env";
import { simulateOmnibus } from "../src/omnibuses/tools/simulate";
import { isKnownError } from "../src/common/errors";
import Mocha from "mocha";
import fs from "node:fs/promises";
import { Omnibus } from "../src/omnibuses/omnibuses";
import { uploadDescription } from "./sub-tasks/upload-description";
import { printVoteDeployInfo } from "./sub-tasks/print-vote-info";
import { getPilot } from "./sub-tasks/getPilot";
import { prepareProviderAndNode } from "./sub-tasks/prepare-provider-and-node";
import { Signer } from "ethers";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTAINER_NAMES, stopContainer } from "../src/docker";
import { runCoreTests, runDepotTests, runRpcNodeBackground, runScriptsTests } from "./sub-tasks/containers";
import { logBlue } from "../src/common/color";
import lido from "../src/lido";
import { networkIdByName } from "../src/networks";

traces.hardhat.enableTracing();

/*
Omnibus states:
- not launched:
  - only estimated launching date is known
- launched & not executed:
  - we know voteId, launching date & launching block
- executed:
  - everything is known

omnibus:test
  - not launched:
    - start & exec & test
  - launched:
    - exec & test
  - executed:
    - aborting testing

omnibus:run
  - not launched
    - simulate & launch
  - launched
    - simulate & launch
  - executed
    - aborting
*/

async function loadOmnibus(name: string) {
  const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
  if (omnibus.isExecuted) {
    throw new Error(`The omnibus "${omnibus.voteId}" already executed. Aborting...`);
  }
  return omnibus;
}

type RpcNodes = "hardhat" | "local" | "remote";

async function runOmnibus(
  name: string,
  omnibus: Omnibus,
  hre: HardhatRuntimeEnvironment,
  rpc: RpcNodes,
  testAccount = true,
  silent = false,
) {
  logBlue(`Running the omnibus ${name} on "${omnibus.network}" network\n`);
  console.log(`Omnibus items:\n${omnibus.summary}\n`);
  const { provider } = await prepareProviderAndNode(omnibus.network, hre, rpc);

  const omnibusDescription = await uploadDescription(name, omnibus, silent);

  const pilot: Signer = await getPilot(provider, hre, testAccount);

  // Launch the omnibus
  const tx = await votes.start(pilot, omnibus.script, omnibusDescription);
  const { voteId, receipt } = await votes.wait(tx);
  await printVoteDeployInfo(voteId, receipt);
  return { voteId, provider };
}

task("omnibus:test", "Runs tests for the given omnibus")
  .addPositionalParam<string>("name", "Name of the omnibus to test", undefined, types.string, false)
  .addOptionalParam<RpcNodeName | "local">("rpc", "The dev RPC node type to run tests on", "hardhat", types.string)
  .addOptionalParam<number>("blockNumber", "Block number to spawn rpc node on", undefined, types.int)
  .setAction(async ({ name }) => {
    const omnibus = await loadOmnibus(name);

    console.log(`Omnibus items:\n${omnibus.summary}\n`);
    const omnibusTestFile = `omnibuses/${name}.spec.ts`;
    try {
      await fs.stat(omnibusTestFile);
      await runTestFile(omnibusTestFile);
      return;
    } catch (err) {
      console.error(err);
      console.warn(chalk.bold.yellow(`Test file "${omnibusTestFile}" not found. Write tests first!`));
      return;
    }
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
    "restartNode",
    "Restart hardhat-node container if it was running before task",
    true,
    types.boolean,
  )
  .addOptionalParam<boolean>("hideDebug", "Hide container logs and come extra information", false, types.boolean)
  .setAction(async ({ name, repo, pattern, mountTests, restartNode, hideDebug }, hre) => {
    const omnibus = await loadOmnibus(name);
    env.checkEnvVars();

    logBlue(`Run hardhat-node container`);
    const result = await runRpcNodeBackground(CONTAINER_NAMES.RPC_DIRTY_NODE, env.DIRTY_FORK_PORT(), restartNode);
    const { container: rpcContainer, provider } = result;

    const { voting } = lido.chainId(networkIdByName[omnibus.network], provider);

    if (!repo || repo === "depot") {
      await runDepotTests("_example_omnibus", hideDebug);
    }

    let voteId = await voting.votesLength();

    if (repo !== "depot" && restartNode) {
      const info = await runOmnibus(name, omnibus, hre, "local", true, true);
      voteId = info.voteId;
      await votes.pass(info.provider, voteId);
    }

    if (!repo || repo === "core") {
      await runCoreTests(pattern, hideDebug, mountTests); // "test/custom/_example_omnibus_test_for_core_repo.ts"
    }

    if (!repo || repo === "scripts") {
      await runScriptsTests(Number(voteId), pattern, hideDebug, mountTests); // "tests/custom/_example_omnibus_test_for_scripts_repo.py"
    }

    if (rpcContainer) {
      logBlue(`Stop hardhat-node container`);
      await stopContainer(rpcContainer, CONTAINER_NAMES.RPC_DIRTY_NODE);
    }
  });

type OmnibusRunParams = {
  name: string;
  testAccount: boolean;
  rpc: RpcNodes;
};

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>("testAccount", "Is the omnibus run using the test account", true, types.boolean)
  .addOptionalParam<RpcNodes>(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, testAccount, rpc }: OmnibusRunParams, hre) => {
    try {
      const omnibus = await loadOmnibus(name);

      env.checkEnvVars();
      await runOmnibus(name, omnibus, hre, rpc, testAccount);

      await prompt.sigint();
    } catch (err) {
      if (!isKnownError(err)) {
        throw err;
      }
      console.error(err.message);
    }
  });

task("omnibus:simulate", "Simulate the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>("testAccount", "Is the omnibus run using the test account", true, types.boolean)
  .addOptionalParam<"hardhat" | "local" | "remote">(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, rpc }: OmnibusRunParams, hre) => {
    const omnibus = await loadOmnibus(name);

    env.checkEnvVars();
    console.log(`Simulate the omnibus ${name} on "${omnibus.network}" network\n`);
    const { provider } = await prepareProviderAndNode(omnibus.network, hre, rpc);

    try {
      console.log(`Omnibus items:\n${omnibus.summary}\n`);
      await simulateOmnibus(omnibus, provider);

      await prompt.sigint();
    } catch (err) {
      console.error(err);
      if (!isKnownError(err)) {
        throw err;
      }
      console.error(err.message);
    }
  });

async function runTestFile(testFile: string) {
  const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });
  mocha.addFile(testFile);
  await new Promise((resolve) => mocha.run(resolve));
}
