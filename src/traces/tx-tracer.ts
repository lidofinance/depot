import { BaseContract, ContractTransactionReceipt } from "ethers";
import { NamedContractsResolver } from "../contracts";
import { TraceStrategy } from "./debug-trace-tx-strategy";
import { TxCallTrace } from "./tx-call-trace";
import providers from "../providers";
import bytes from "../common/bytes";

export class TxTracer {
  constructor(
    private readonly traceStrategy: TraceStrategy,
    private readonly contractsResolver: NamedContractsResolver,
  ) {}

  async trace(receipt: ContractTransactionReceipt) {
    const callTraceItems = await this.traceStrategy.trace(receipt);

    const addresses = new Set<Address>();
    for (let callTraceItem of callTraceItems) {
      if (
        callTraceItem.type === "CALL" ||
        callTraceItem.type === "DELEGATECALL" ||
        callTraceItem.type === "STATICCALL"
      ) {
        addresses.add(callTraceItem.to);
      }
      if (
        (callTraceItem.type === "CREATE" || callTraceItem.type === "CREATE2") &&
        callTraceItem.deployedAddress
      ) {
        addresses.add(callTraceItem.deployedAddress);
      }
    }
    const contracts = await this.resolveContracts(
      await providers.chainId(receipt),
      Array.from(addresses),
    );
    const network = await providers.provider(receipt).getNetwork();
    return new TxCallTrace(network, bytes.normalize(receipt.from), callTraceItems, contracts);
  }

  private async resolveContracts(
    chainId: bigint,
    addresses: Address[],
  ): Promise<Record<Address, BaseContract>> {
    const res: Record<Address, BaseContract> = {};
    const resolvedContracts = new Set<Address>();
    for (const address of addresses) {
      if (resolvedContracts.has(address)) continue;
      resolvedContracts.add(address);
      const contract = await this.contractsResolver.resolve(chainId, address);
      if (contract) {
        res[address] = contract;
      }
    }
    return res;
  }
}
