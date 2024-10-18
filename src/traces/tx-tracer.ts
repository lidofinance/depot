import { BaseContract, ContractTransactionReceipt } from "ethers";

import bytes from "../common/bytes";
import providers from "../providers";
import { TraceStrategy } from "./debug-trace-tx-strategy";
import { isCallOpcode, isCreateOpcode, isLogOpcode } from "./evm-opcodes";
import { TxTrace, TxTraceCallItem, TxTraceCreateItem, TxTraceLogItem } from "./tx-traces";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";
import { Address } from "../common/types";
import { NamedContract } from "../contracts";

export class TxTracer {
  constructor(
    private readonly traceStrategy: TraceStrategy,
    private readonly contractInfoResolver?: ContractInfoResolver | null,
  ) {}

  async trace(receipt: ContractTransactionReceipt) {
    const callTraceItems = await this.traceStrategy.trace(receipt);

    const addresses = new Set<Address>();
    for (const [idx, callTraceItem] of callTraceItems.entries()) {
      if (isCallOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCallItem).address);
      } else if (isCreateOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCreateItem).address);
      } else if (isLogOpcode(callTraceItem.type)) {
        const cti = callTraceItem as TxTraceLogItem;
        for (const item of callTraceItems.slice(0, idx).reverse()) {
          if (isCallOpcode(item.type) && item.depth === cti.depth - 1) {
            callTraceItems[idx].address = (item as TxTraceCallItem).address;
            break;
          }
        }
      }
    }
    const contracts = await this.resolveContracts(await providers.chainId(receipt), Array.from(addresses));
    const network = await providers.provider(receipt).getNetwork();
    return new TxTrace(network, bytes.normalize(receipt.from), callTraceItems, contracts);
  }

  private async resolveContracts(chainId: bigint, addresses: Address[]): Promise<Record<Address, NamedContract>> {
    const res: Record<Address, NamedContract> = {};
    if (!this.contractInfoResolver) return res;

    const resolvedContracts = new Set<Address>();

    for (const address of addresses) {
      if (resolvedContracts.has(address)) continue;

      resolvedContracts.add(address);

      try {
        let contractInfo = await this.contractInfoResolver.resolve(chainId, address);
        if (contractInfo.implementation) {
          try {
            contractInfo = await this.contractInfoResolver.resolve(chainId, contractInfo.implementation);
          } catch (e) {
            console.error(e);
          }
        }
        const contract = new BaseContract(address, contractInfo.abi as any) as NamedContract;
        contract.name = contractInfo.name;
        res[address] = contract;
      } catch (e) {
        console.error(e);
      }
    }
    return res;
  }
}
