import bytes, { HexStrPrefixed } from "../common/bytes";
import { isCallOpcode, isCreateOpcode, isLogOpcode } from "./evm-opcodes";
import { TxTrace, TxTraceCallItem, TxTraceCreateItem } from "./tx-traces";
import { Address } from "../common/types";
import { TraceStrategy } from "./types";
import { NetworkName } from "../network";
import { Contract, resolveContract } from "../contracts/contracts";

export class TxTracer {
  constructor(private readonly traceStrategy: TraceStrategy) {}

  async trace(network: NetworkName, txHash: HexStrPrefixed, prePopulatedContracts: Contract[] = []) {
    const callTraceItems = await this.traceStrategy.trace(txHash);

    const addresses = new Set<Address>();
    for (const [idx, callTraceItem] of callTraceItems.entries()) {
      if (isCallOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCallItem).address);
      } else if (isCreateOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCreateItem).address);
      } else if (isLogOpcode(callTraceItem.type)) {
        addresses.add(callTraceItem.address!);
      }
    }
    const resolvedContracts = await this.resolveContracts(network, Array.from(addresses));
    return new TxTrace(
      network,
      bytes.normalize(callTraceItems[0].address || "0x"),
      callTraceItems,
      resolvedContracts,
      prePopulatedContracts,
    );
  }

  private async resolveContracts(networkName: NetworkName, addresses: Address[]): Promise<Record<Address, Contract[]>> {
    const res: Record<Address, Contract[]> = {};

    const allResolvedContracts = new Set<Address>();

    for (const address of addresses) {
      const normalizedAddress = bytes.normalize(address);
      if (allResolvedContracts.has(normalizedAddress)) continue;

      let resolvedContracts = await resolveContract(networkName, normalizedAddress);

      allResolvedContracts.add(normalizedAddress);
      res[normalizedAddress] = resolvedContracts;
    }
    return res;
  }
}
