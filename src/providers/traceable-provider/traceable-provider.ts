import { JsonRpcProvider } from "ethers";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { ContractsResolver } from "../../contracts";
import { StaticProvider } from "../static-provider";
import { ProviderExtender, SendProvider } from "../types";
import { TxCallTrace } from "./transaction-call-trace";
import { HardhatVmTxTracer } from "./hardhat-vm-tx-tracer";
import { DebugTxTracer } from "./debug-tx-tracer";

interface TxCallTracer {
  isTracingEnabled: boolean;
  enableTracing(): void;
  disableTracing(): void;
  getTrace(txHash: string): Promise<TxCallTrace | undefined>;
}

interface TraceableProviderExtension {
  tracer: TxCallTracer;
}

export type TraceableProvider<T extends StaticProvider<SendProvider>> = T &
  TraceableProviderExtension;

export class TraceableProviderExtender<T extends StaticProvider<SendProvider>>
  implements ProviderExtender<T, TraceableProviderExtension>
{
  private readonly contractsResolver: ContractsResolver;
  constructor(contractsResolver: ContractsResolver) {
    this.contractsResolver = contractsResolver;
  }

  extend(provider: T): TraceableProvider<T> {
    const tracer =
      provider instanceof HardhatEthersProvider
        ? new HardhatVmTxTracer(provider, this.contractsResolver)
        : provider instanceof JsonRpcProvider
        ? new DebugTxTracer(provider, this.contractsResolver)
        : null;

    if (!tracer) {
      throw new Error(`Unsupported provider ${tracer}`);
    }

    return Object.assign(provider, { tracer });
  }
}
