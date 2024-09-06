import chalk from "chalk";
import { task } from "hardhat/config";
import { BigNumberish, ContractTransactionReceipt, JsonRpcProvider, Wallet } from "ethers";
import * as types from "hardhat/internal/core/params/argumentTypes";

import votes from "../src/votes";
import rpcs, { RpcNodeName } from "../src/rpcs";
import traces from "../src/traces";
import networks, { NetworkName } from "../src/networks";
import bytes from "../src/common/bytes";
import format from "../src/common/format";
import prompt from "../src/common/prompt";
import { simulateOmnibus, SimulationGroup } from "../src/omnibuses/tools/simulate";
import { isKnownError } from "../src/common/errors";
import Mocha from "mocha";
import fs from "node:fs/promises";
import path from "node:path";
import { Omnibus } from "../src/omnibuses/omnibuses";
import { uploadDescription } from "../src/ipfs/upload-description";
import { getConfigFromEnv } from "../src/common/config";
import { getIPFSFileByCID } from "../src/ipfs/utils";

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

    const omnibusTestFile = `omnibuses/${name}.spec.ts`;
    try {
      await fs.stat(omnibusTestFile);
      await runTestFile(omnibusTestFile);
      return;
    } catch (e) {
      console.error(e);
      console.warn(chalk.bold.yellow(`Test file "${omnibusTestFile}" not found. Write tests first!`));
      return;
    }
  });

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>("testAccount", "Is the omnibus run using the test account", true, types.boolean)
  .addOptionalParam<string>("cid", "IPFS description CID", "", types.string)
  .addOptionalParam<RpcNodeName | "local" | "remote">(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, testAccount, cid, rpc }, hre) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;

    if (omnibus.isExecuted) {
      console.log(`Omnibus already was executed. Aborting...`);
      return;
    }

    console.log(`Running the omnibus ${name} on "${omnibus.network}" network\n`);
    console.log(`Omnibus items:\n`);
    console.log(omnibus.summary);
    console.log("\n");

    const VOTE_CID_PREFIX = "lidovoteipfs://";
    if (!cid) {
      try {
        cid = await fs.readFile(getCIDFilePath(name), "utf-8");
        console.log(`CID was found in the file: ${cid}`);
      } catch (e) {
        const confirm = await prompt.confirm("CID was not provided. Do you want to upload a new one?");
        if (confirm) {
          cid = await uploadDescription(name, omnibus.description, getConfigFromEnv());
          if (cid) {
            await saveCID(name, cid);
          }
        }
      }
    }

    if (cid) {
      try {
        console.log(`Fetching description from IPFS...`);
        const desc = await getIPFSFileByCID(cid);
        const answer = await prompt.select(
          `Check description from IPFS ${cid}:\n${"-".repeat(10)}\n${desc}\n${"-".repeat(10)}\nWhat do you want to do?`,
          [
            { title: "Use this CID", value: "use" },
            { title: "Upload description from omnibus", value: "upload" },
            { title: "Use summary as description", value: "summary" },
            { title: "Exit and solve it manually", value: "abort" },
          ],
        );
        if (answer === "use") {
          console.log(`Using the CID: ${cid}`);
        } else if (answer === "upload") {
          console.log(`Uploading the description to IPFS`);
          cid = await uploadDescription(name, omnibus.description, getConfigFromEnv());
          if (cid) {
            await saveCID(name, cid);
          }
        } else if (answer === "summary") {
          console.log(`Using the the omnibus summary as a description`);
          cid = "";
        } else {
          return;
        }
      } catch (e: any) {
        console.error(`Error fetching description from IPFS: ${e.message}`);
        const answer = await prompt.select(`Can't get description from IPFS. What do you want to do?`, [
          { title: "Use this CID anyway", value: "use" },
          { title: "Use omnibus summary as a description", value: "summary" },
          { title: "Exit and solve it manually", value: "abort" },
        ]);
        if (answer === "use") {
          console.log(`Using the CID: ${cid}`);
        } else if (answer === "summary") {
          console.log(`Using the the omnibus summary as a description`);
          cid = "";
        } else {
          return;
        }
      }
    }

    const omnibusDescription = cid ? `${omnibus.summary}\n${VOTE_CID_PREFIX}${cid}` : omnibus.summary;
    const confirm = await prompt.confirm(
      "Omnibus description:\n\n" + omnibusDescription + "\n\nDo you want to proceed?",
    );
    if (!confirm) {
      console.log("The omnibus launch was canceled");
      return;
    }

    const [provider, node] = await prepareExecEnv(omnibus.network, rpc);

    try {
      // Prepare execution environment
      const network = await provider.getNetwork();
      console.log(`Network:`);
      console.log(`  - rpc: ${rpc}`);
      console.log(`  - name: ${network.name}`);
      console.log(`  - chainId: ${network.chainId}\n`);

      const pilot = testAccount
        ? await votes.creator(provider)
        : await hre.keystores.unlock().then((privateKey) => new Wallet(privateKey));

      console.log(`Deployer ${format.address(bytes.normalize(await pilot.getAddress()))}`);
      console.log(`  - nonce: ${await pilot.getNonce()}`);
      console.log(`  - balance: ${hre.ethers.formatEther(await provider.getBalance(pilot))} ETH\n`);

      // Simulate omnibus and ask for confirmation
      console.log(`Simulating the omnibus using "hardhat" node...`);
      printOmnibusSimulation(await simulateOmnibus(omnibus, provider));
      const isConfirmed = await prompt.confirm("Does it look good?");

      if (!isConfirmed) {
        console.log("The omnibus launch was canceled");
        return;
      }

      // Launch the omnibus
      console.log(`Sending the tx to start the vote...`);
      const tx = await votes.start(pilot, omnibus.script, omnibusDescription);

      console.log("Transaction successfully sent:", tx.hash);

      console.log("Waiting transaction will be confirmed...");
      const { voteId, receipt } = await votes.wait(tx);

      await printVoteInfo(voteId, receipt);

      await prompt.sigint();
    } catch (e) {
      if (isKnownError(e)) {
        console.error(e.message);
        return;
      }
      throw e;
    } finally {
      await node?.stop();
    }
  });

task("omnibus:upload-description", "Uploads omnibus description to IPFS")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .setAction(async ({ name }) => {
    const config = getConfigFromEnv();
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
    if (omnibus.isExecuted) {
      console.log(`Omnibus already was executed. Aborting...`);
      return;
    }

    const cid = await uploadDescription(name, omnibus.summary, config);
    if (cid) {
      await saveCID(name, cid);
    }
  });

function printOmnibusSimulation([gasUsed, groups]: [bigint, SimulationGroup[]]) {
  console.log(`Enactment gas costs: ${gasUsed}`);
  for (let i = 0; i < groups.length; ++i) {
    const group = groups[i];
    console.log(chalk.green(`${i + 1}. ${group.title}`));
    console.log("  EVM call:");
    console.log(group.call.format(4));
    console.log("  Call Trace:");
    console.log(group.trace.format(2));
    console.log();
  }
}

async function printVoteInfo(voteId: BigNumberish, receipt: ContractTransactionReceipt) {
  const launchBlock = await receipt.getBlock();
  const launchDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(launchBlock.timestamp * 1000),
  );
  console.log(`
Omnibus successfully launched 🎉!
Details:
    Vote ID: ${voteId}
    Block number: ${receipt.blockNumber}
    Launch date: ${launchDate}
`);
}

async function prepareExecEnv(network: NetworkName, rpc: RpcNodeName | "local" | "remote", blockNumber?: number) {
  if (rpc === "remote") {
    console.log(`Running on the remote RPC node on network "${network}"`);
    return [new JsonRpcProvider(networks.rpcUrl("eth", network))] as const;
  } else if (rpc === "local") {
    const url = networks.localRpcUrl("eth");
    console.log(
      `Running on the local RPC node on url ${url}. Expected network ${network}, expected blockNumber ${
        blockNumber ?? '"any"'
      }`,
    );
    const provider = new JsonRpcProvider(url);
    const currentBlockNumber = await provider.getBlockNumber();
    if (blockNumber !== undefined && currentBlockNumber !== blockNumber) {
      throw new Error(
        `Local RPC node set on the wrong block number. Expected ${blockNumber}, actual: ${currentBlockNumber}`,
      );
    }
    return [provider] as const;
  } else {
    console.log(`Spawning "${rpc}" RPC node for "${network}" network, on block number ${blockNumber ?? '"latest"'}...`);
    const node = await spawnRpcNode(network, rpc, blockNumber);
    console.log(`RPC node was successfully spawned on ${node.url}`);
    return [node.provider, node] as const;
  }
}

async function spawnRpcNode(network: NetworkName, nodeType: RpcNodeName, blockNumber?: number) {
  try {
    if (nodeType === "hardhat")
      return rpcs.spawn("hardhat", {
        fork: networks.rpcUrl("eth", network),
        forkBlockNumber: blockNumber,
      });
    else if (nodeType === "anvil")
      return rpcs.spawn("anvil", {
        forkUrl: networks.rpcUrl("eth", network),
        forkBlockNumber: blockNumber,
      });
  } catch (e) {
    throw new Error(`Failed to spawn "${nodeType}" node: ${e}`);
  }
  throw new Error(`Unsupported node type "${nodeType}"`);
}

async function runTestFile(testFile: string) {
  const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });
  mocha.addFile(testFile);
  await new Promise((resolve) => mocha.run(resolve));
}

const getCIDFilePath = (omnibusName: string) => path.join("artifacts", `${omnibusName}_description_cid`);
const saveCID = async (omnibusName: string, cid: string) => {
  await fs.writeFile(getCIDFilePath(omnibusName), cid);
};
