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
import type { Signer } from "ethers";

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

task("omnibus:test", "Runs tests for the given omnibus")
  .addPositionalParam<string>("name", "Name of the omnibus to test", undefined, types.string, false)
  .addOptionalParam<RpcNodeName | "local">("rpc", "The dev RPC node type to run tests on", "hardhat", types.string)
  .addOptionalParam<number>("blockNumber", "Block number to spawn rpc node on", undefined, types.int)
  .addOptionalParam<boolean>("simulate", "Shall the simulation be run before the tests", false, types.boolean)
  .setAction(async ({ name }) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;

    if (omnibus.isExecuted) {
      console.log(`The omnibus "${omnibus.voteId}" already executed. Aborting...`);
      return;
    }
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

type OmnibusRunParams = {
  name: string;
  testAccount: boolean;
  rpc: RpcNodeName | "local" | "remote";
};

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>("testAccount", "Is the omnibus run using the test account", true, types.boolean)
  .addOptionalParam<RpcNodeName | "local" | "remote">(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, testAccount, rpc }: OmnibusRunParams, hre) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
    if (omnibus.isExecuted) {
      console.log(`The omnibus "${omnibus?.voteId}" already executed. Aborting...`);
      return;
    }

    env.checkEnvVars();
    console.log(`Running the omnibus ${name} on "${omnibus.network}" network\n`);
    console.log(`Omnibus items:\n${omnibus.summary}\n`);
    const { provider, spawnedNode } = await prepareProviderAndNode(omnibus.network, rpc);

    try {
      const omnibusDescription = await uploadDescription(name, omnibus);

      const pilot: Signer = await getPilot(provider, hre, testAccount);

      // Launch the omnibus
      const tx = await votes.start(pilot, omnibus.script, omnibusDescription);
      const { voteId, receipt } = await votes.wait(tx);
      await printVoteDeployInfo(voteId, receipt);

      await prompt.sigint();
    } catch (err) {
      if (!isKnownError(err)) {
        throw err;
      }
      console.error(err.message);
    } finally {
      await spawnedNode?.stop();
    }
  });

task("omnibus:simulate", "Simulate the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>("testAccount", "Is the omnibus run using the test account", true, types.boolean)
  .addOptionalParam<RpcNodeName | "local" | "remote">(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, rpc }: OmnibusRunParams) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
    if (omnibus.isExecuted) {
      console.log(`The omnibus "${omnibus.voteId}" already executed. Aborting...`);
      return;
    }

    env.checkEnvVars();
    console.log(`Simulate the omnibus ${name} on "${omnibus.network}" network\n`);
    const { provider, spawnedNode } = await prepareProviderAndNode(omnibus.network, rpc);

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
    } finally {
      await spawnedNode?.stop();
    }
  });

async function runTestFile(testFile: string) {
  const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });
  mocha.addFile(testFile);
  await new Promise((resolve) => mocha.run(resolve));
}
