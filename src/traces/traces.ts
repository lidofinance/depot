import { extendProvider } from "hardhat/config";
import { ContractTransactionReceipt } from "ethers";

import env from "../common/env";
import providers from "../providers";
import { TxTrace } from "./tx-traces";
import { TxTracer } from "./tx-tracer";
import { DebugTxTraceStrategy, TraceStrategy } from "./debug-trace-tx-strategy";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { HardhatVmTraceStrategy } from "./hardhat-vm-trace-strategy";
import { EtherscanContractInfoProvider } from "../contract-info-resolver/etherscan-contract-info-provider";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";

// hh tracer must be activated manually before the transaction
let hhTraceStrategy: HardhatVmTraceStrategy = new HardhatVmTraceStrategy();

function attachTracer() {
  extendProvider(async (provider) => {
    await hhTraceStrategy.init(provider);
    return provider;
  });
}

function isTracingEnabled() {
  return hhTraceStrategy.isTracingEnabled;
}

function enableTracing() {
  hhTraceStrategy.enableTracing();
}

function disableTracing() {
  hhTraceStrategy.disableTracing();
}

export const hardhat = {
  setup: attachTracer,
  enableTracing,
  disableTracing,
  isTracingEnabled,
};

export async function trace(receipt: ContractTransactionReceipt): Promise<TxTrace> {
  const provider = providers.provider(receipt);
  let strategy: TraceStrategy | null = null;

  const etherscanToken = env.ETHERSCAN_TOKEN();

  const contractInfoResolver = etherscanToken
    ? new ContractInfoResolver({
        provider: new EtherscanContractInfoProvider(etherscanToken),
      })
    : null;
  if (provider instanceof HardhatEthersProvider || hhTraceStrategy.isSameRootProvider(provider)) {
    if (!hhTraceStrategy.isInitialized) {
      throw new Error(
        `Tracer wasn't attach to hre.ethers.provider. Please add call traces.attach() to the hardhat.config `,
      );
    }
    return new TxTracer(hhTraceStrategy, contractInfoResolver).trace(receipt);
  }

  const { name } = await providers.cheats(provider).node();
  strategy = new DebugTxTraceStrategy(provider);
  const tracer = new TxTracer(strategy, contractInfoResolver);
  return tracer.trace(receipt);
}
