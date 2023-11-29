import chalk from "chalk";
import { task } from "hardhat/config";
import { JsonRpcProvider } from "ethers";
import * as types from "hardhat/internal/core/params/argumentTypes";

import votes from "../src/votes";
import rpcs, { RpcNodeName } from "../src/rpcs";
import providers from "../src/providers";
import traces from "../src/traces";
import { Omnibus, SimulationGroup } from "../src/omnibuses/omnibus";
import networks, { NetworkName } from "../src/networks";
import bytes from "../src/common/bytes";
import format from "../src/common/format";
import prompt from "../src/common/prompt";

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
  .addOptionalParam<RpcNodeName | "local">(
    "rpc",
    "The dev RPC node type to run tests on",
    "hardhat",
    types.string,
  )
  .addOptionalParam<number>(
    "blockNumber",
    "Block number to spawn rpc node on",
    undefined,
    types.int,
  )
  .addOptionalParam<boolean>(
    "simulate",
    "Shall the simulation be run before the tests",
    false,
    types.boolean,
  )
  .setAction(async ({ name, rpc = "hardhat", blockNumber, simulate }) => {
    const omnibus: Omnibus<NetworkName> = require(`../omnibuses/${name}.ts`).default;

    if (omnibus.isExecuted) {
      console.log(`The omnibus "${omnibus.name}" already executed. Aborting...`);
      return;
    }

    let [provider, node] = await prepareExecEnv(omnibus.network, rpc, blockNumber);

    try {
      if (!omnibus.isLaunched) {
        const currentBlockNumber = await provider.getBlockNumber();
        const block = await provider.getBlock(currentBlockNumber);
        if (!block) {
          throw new Error(`Block ${currentBlockNumber} not found`);
        }
        const currentTimestamp = block.timestamp;
        if (omnibus.launchingTimestamp > currentTimestamp) {
          await providers
            .cheats(provider)
            .increaseTime(omnibus.launchingTimestamp - currentTimestamp);
        }
      }

      await omnibus.test(provider);

      if (simulate) {
        console.log(`Simulating the omnibus using "${rpc}" node...`);
        printOmnibusSimulation(await omnibus.simulate(provider));
      } else {
        console.log(`The simulation step was skipped.`);
      }

      await prompt.sigint();
    } finally {
      await node?.stop();
    }
  });

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addOptionalParam<boolean>(
    "testAccount",
    "Is the omnibus run using the test account",
    true,
    types.boolean,
  )
  .addOptionalParam<RpcNodeName | "local" | "remote">(
    "rpc",
    'The RPC node used to launch omnibus. Possible values: hardhat, ganache, anvil, local, remote. When "remote" is passed - run using origin RPC url, without forked dev node',
    "hardhat",
    types.string,
  )
  .setAction(async ({ name, testAccount, rpc }, hre) => {
    const omnibus: Omnibus<NetworkName> = require(`../omnibuses/${name}.ts`).default;

    if (omnibus.isExecuted) {
      console.log(`Omnibus already was executed. Aborting...`);
      return;
    }

    console.log(`Running the omnibus ${name} on "${omnibus.network}" network\n`);
    console.log(`Omnibus items:`);
    omnibus.titles.forEach((title, index) => {
      console.log(`  ${index + 1}. ${title}`);
    });
    console.log("\n");

    const [provider, node] = await prepareExecEnv(omnibus.network, rpc);

    try {
      const network = await provider.getNetwork();
      console.log(`Network:`);
      console.log(`  - rpc: ${rpc}`);
      console.log(`  - name: ${network.name}`);
      console.log(`  - chainId: ${network.chainId}\n`);

      const pilot = testAccount
        ? await votes.creator(provider)
        : await hre.keystore.unlock(provider);

      console.log(`Deployer ${format.address(bytes.normalize(await pilot.getAddress()))}`);
      console.log(`  - nonce: ${await pilot.getNonce()}`);
      console.log(`  - balance: ${hre.ethers.formatEther(await provider.getBalance(pilot))} ETH\n`);

      console.log(`Simulating the omnibus using "hardhat" node...`);
      printOmnibusSimulation(await omnibus.simulate(hre.ethers.provider));
      const isConfirmed = await prompt.confirm("Does it look good?");

      if (!isConfirmed) {
        console.log("The omnibus launch was canceled");
        return;
      }

      console.log(`Sending the tx to start the vote...`);
      const tx = await votes.start(pilot, omnibus.script, omnibus.description);

      console.log("Transaction successfully sent:", tx.hash);

      console.log("Waiting transaction will be confirmed...");
      const { voteId } = await votes.wait(tx);

      console.log(`Omnibus ${voteId} was launched successfully 🎉`);
      await prompt.sigint();
    } finally {
      await node?.stop();
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

async function prepareExecEnv(
  network: NetworkName,
  rpc: RpcNodeName | "local" | "remote",
  blockNumber?: number,
) {
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
    console.log(
      `Spawning "${rpc}" RPC node for "${network}" network, on block number ${
        blockNumber ?? '"latest"'
      }...`,
    );
    const node = await spawnRpcNode(network, rpc, blockNumber);
    console.log(`RPC node was successfully spawned on ${node.url}`);
    return [node.provider, node] as const;
  }
}

async function spawnRpcNode(network: NetworkName, nodeType: RpcNodeName, blockNumber?: number) {
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
  else if (nodeType === "ganache")
    return rpcs.spawn("ganache", {
      chain: {
        hardfork: "istanbul",
        chainId: +networks.get("eth", network).chainId.toString(),
        vmErrorsOnRPCResponse: true,
      },
      wallet: {
        totalAccounts: 10,
        mnemonic: "test test test test test test test test test test test junk",
      },
      fork: {
        url: networks.rpcUrl("eth", network),
        blockNumber,
      },
    });
  throw new Error(`Unsupported node type "${nodeType}"`);
}
