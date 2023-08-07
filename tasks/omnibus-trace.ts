import { task } from "hardhat/config";
import { passVote, startVote } from "../test/helpers/_voting";
import { Network, FunctionFragment } from "ethers";

import * as helpers from "@nomicfoundation/hardhat-toolbox/network-helpers";
import chalk from "chalk";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import providers, {
  StaticProvider,
  StaticProviderExtender,
  LocalProviderExtender,
  TraceableProviderExtender,
} from "../src/providers";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import {
  TxCallTrace,
  TxCallTraceItem,
} from "../src/providers/traceable-provider/transaction-call-trace";
import { Omnibus } from "../src/omnibus";
import { ParsedOmnibusCall } from "../src/omnibus/omnibus";
import lido from "../src/lido";

import contractsService from "../src/contracts";

async function configureNetwork(
  hre: HardhatRuntimeEnvironment,
  networkName: NetworkName,
  date: Date,
) {
  await helpers.reset(providers.rpcUrl(networkName));
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const currentBlock = await hre.ethers.provider.getBlock(blockNumber);

  if (!currentBlock) {
    throw new Error("Block is undefined");
  }

  const blockchainDate = new Date(currentBlock.timestamp * 1000);

  const SECONDS_PER_BLOCK = 12;

  const launchDateBlockNumber = Math.floor(
    blockNumber - (blockchainDate.getTime() - date.getTime()) / 1000 / SECONDS_PER_BLOCK,
  );

  const expectedBlock = await hre.ethers.provider.getBlock(launchDateBlockNumber);

  if (!expectedBlock) {
    throw new Error("Block not found");
  }

  await helpers.reset(providers.rpcUrl(networkName), expectedBlock.number);

  const bn = await hre.ethers.provider.getBlockNumber();
  console.log("Current Block:", bn);
  const block = await hre.ethers.provider.getBlock(bn);
  if (!block) {
    throw new Error("Invalid block number");
  }
  console.log("Blockchain Time:", new Date(block.timestamp * 1000).toUTCString());
}

task("omnibus:trace", "Traces omnibus with given name")
  .addPositionalParam("omnibusName", "Name of the omnibus to trace")
  .setAction(async ({ omnibusName }, hre) => {
    const omnibus: Omnibus = require(`../omnibuses/${omnibusName}`).default;

    console.log("Configuring network...");
    await configureNetwork(hre, omnibus.network, omnibus.launchDate);

    const provider = providers.extend(hre.ethers.provider, [
      new StaticProviderExtender<HardhatEthersProvider>(new Network("mainnet", 1)),
      new LocalProviderExtender<HardhatEthersProvider>(),
      new TraceableProviderExtender<StaticProvider<HardhatEthersProvider>>(
        contractsService.resolver(),
      ),
    ]);

    console.log("Starting omnibus voting...");
    const [voteId] = await startVote(provider, await omnibus.prepareEVMScript());

    provider.tracer.enableTracing();
    console.log("Executing the omnibus...");
    const enactmentReceipt = await passVote(provider, voteId);
    provider.tracer.disableTracing();

    console.log("Preparing trace...");
    const trace = await provider.tracer.getTrace(enactmentReceipt.hash);

    if (!trace) {
      throw new Error("Transaction trace not found");
    }

    const { addresses, contracts } = await lido[omnibus.version](provider);

    const filteredTrace = trace
      .filter(
        filterMethodCalls([
          {
            type: "CALL",
            address: addresses.kernel,
            fragment: contracts.kernel.getFunction("getApp").fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.kernel,
            fragment: contracts.kernel.getFunction("getApp").fragment,
          },
          {
            type: "CALL",
            address: addresses.kernel,
            fragment: contracts.kernel.getFunction("hasPermission").fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.kernel,
            fragment: contracts.kernel.getFunction("hasPermission").fragment,
          },
          {
            type: "CALL",
            address: addresses.evmScriptRegistry,
            fragment: contracts.evmScriptRegistry.getFunction("getScriptExecutor").fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.evmScriptRegistry,
            fragment: contracts.evmScriptRegistry.getFunction("getScriptExecutor").fragment,
          },
          {
            type: "CALL",
            address: addresses.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32)").fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32)").fragment,
          },
          {
            type: "CALL",
            address: addresses.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32,bytes)")
              .fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32,bytes)")
              .fragment,
          },
          {
            type: "CALL",
            address: addresses.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32,uint256[])")
              .fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.implementations.acl,
            fragment: contracts.acl.getFunction("hasPermission(address,address,bytes32,uint256[])")
              .fragment,
          },
          {
            type: "DELEGATECALL",
            address: addresses.callsScript,
            fragment: contracts.callsScript.getFunction("execScript").fragment,
          },
        ]),
      )
      .filter(omitProxyDelegateCalls());

    displayOmnibusTrace(omnibus.parse(), filteredTrace);
  });

function displayOmnibusTrace(parsedEvmScript: ParsedOmnibusCall[], callTrace: TxCallTrace) {
  let voteCallIndices: number[] = [];
  for (let i = 0; i < parsedEvmScript.length; ++i) {
    const { call } = parsedEvmScript[i];
    const startIndex = callTrace.calls.findIndex(
      (opCode) =>
        (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
        opCode.to.toLowerCase() === call.address.toLowerCase() &&
        opCode.input === call.calldata,
    );
    voteCallIndices.push(startIndex);
  }

  const paddingsRemapping: Record<number, number> = {};

  const paddings = new Set<number>();

  for (const call of callTrace.calls) {
    paddings.add(call.depth);
  }

  const paddingsSorted = Array.from(paddings).sort((a, b) => a - b);

  for (let i = 0; i < paddingsSorted.length; ++i) {
    paddingsRemapping[paddingsSorted[i]] = i;
  }

  const depths: number[] = [];

  for (let i = 0; i < callTrace.calls.length; ++i) {
    depths[i] = paddingsRemapping[callTrace.calls[i].depth];
    while (
      i < callTrace.calls.length - 1 &&
      callTrace.calls[i].depth <= callTrace.calls[i + 1].depth
    ) {
      if (callTrace.calls[i].depth < callTrace.calls[i + 1].depth) {
        depths[i + 1] = depths[i] + 1;
      } else {
        depths[i + 1] = depths[i];
      }
      i += 1;
    }
  }

  let currentVoteGroupIndex = 0;
  for (let i = 1; i < callTrace.calls.length; ++i) {
    if (voteCallIndices[currentVoteGroupIndex] === i) {
      const title = chalk.bold.greenBright(
        `${currentVoteGroupIndex + 1}/${voteCallIndices.length} ${
          parsedEvmScript[currentVoteGroupIndex].title
        }`,
      );
      console.log();
      console.log(title);
      currentVoteGroupIndex += 1;
    }
    const op = callTrace.calls[i];
    console.log(callTrace.formatOpCode(op, depths[i]));
  }
  console.log();
}

interface MethodCallConfig {
  type: "CALL" | "DELEGATECALL" | "STATICCALL" | "CALLCODE";
  address: Address;
  fragment: FunctionFragment;
}

function omitProxyDelegateCalls() {
  return (opCode: TxCallTraceItem, i: number, opCodes: TxCallTraceItem[]) => {
    if (opCode.type !== "DELEGATECALL") return true;
    const prevOpcode = opCodes[i - 1];
    if (prevOpcode.type !== "CALL" && prevOpcode.type !== "STATICCALL") return true;
    return opCode.input !== prevOpcode.input;
  };
  // !(
  //   opCode.type === "DELEGATECALL" &&
  //   (opCodes[i - 1].type === "CALL" || opCodes[i - 1].type === "STATICCALL") &&
  //   opCode.input === opCodes[i - 1].input
  // );
}

function filterMethodCalls(calls: MethodCallConfig[]) {
  return (opCode: TxCallTraceItem) =>
    !calls.some(
      (call) =>
        call.type === opCode.type &&
        call.address.toLowerCase() === opCode.to.toLowerCase() &&
        call.fragment.selector === opCode.input.slice(0, 10),
    );
}
