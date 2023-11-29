import { extendProvider } from "hardhat/config";
import { ContractTransactionReceipt } from "ethers";
import { TxCallTrace } from "./tx-call-trace";
import providers from "../providers";
import { TraceTxStrategy } from "./trace-tx-strategy";
import { DebugTxTraceStrategy, TraceStrategy } from "./debug-trace-tx-strategy";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { TxTracer } from "./tx-tracer";
import contracts from "../contracts";
import { HardhatVmTraceStrategy } from "./hardhat-tracer-extension";

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

export async function trace(receipt: ContractTransactionReceipt): Promise<TxCallTrace> {
  const provider = providers.provider(receipt);
  let strategy: TraceStrategy | null = null;

  if (provider instanceof HardhatEthersProvider || hhTraceStrategy.isSameRootProvider(provider)) {
    if (!hhTraceStrategy.isInitialized) {
      throw new Error(
        `Tracer wasn't attach to hre.ethers.provider. Please add call traces.attach() to the hardhat.config `,
      );
    }
    return new TxTracer(hhTraceStrategy, contracts.resolver()).trace(receipt);
  }

  const { name } = await providers.cheats(provider).node();
  strategy = name === "anvil" ? new TraceTxStrategy(provider) : new DebugTxTraceStrategy(provider);
  const tracer = new TxTracer(strategy, contracts.resolver());
  return tracer.trace(receipt);
}
