import bytes, { HexStrPrefixed } from "../common/bytes";
import { isCallOpcode, isCreateOpcode, isLogOpcode } from "./evm-opcodes";
import { TxTrace, TxTraceCallItem, TxTraceCreateItem } from "./tx-traces";
import { Address } from "../common/types";
import { TraceStrategy } from "./types";
import { NetworkName } from "../network";
import { Contract, resolveContract } from "../contracts/contracts";

export const tracerDeps = { resolveContract };

export class TxTracer {
  constructor(private readonly traceStrategy: TraceStrategy) {}

  async trace(network: NetworkName, txHash: HexStrPrefixed, prePopulatedContracts: Contract[] = []) {
    const callTraceItems = await this.traceStrategy.trace(txHash);

    const addresses = new Set<Address>();
    for (const [_idx, callTraceItem] of callTraceItems.entries()) {
      if (isCallOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCallItem).address);
      } else if (isCreateOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCreateItem).address);
      } else if (isLogOpcode(callTraceItem.type)) {
        addresses.add(callTraceItem.address!);
      }
    }
    const resolvedContracts = await this.resolveContracts(network, Array.from(addresses), prePopulatedContracts);
    return new TxTrace(
      network,
      bytes.normalize(callTraceItems[0].address || "0x"),
      callTraceItems,
      resolvedContracts,
      prePopulatedContracts,
    );
  }

  private async resolveContracts(
    networkName: NetworkName,
    addresses: Address[],
    prePopulatedContracts: Contract[],
  ): Promise<Record<Address, Contract[]>> {
    const res: Record<Address, Contract[]> = {};

    const allResolvedContracts = new Set<Address>();

    for (const address of addresses) {
      const normalizedAddress = bytes.normalize(address);
      if (allResolvedContracts.has(normalizedAddress)) continue;
      const prePopulatedContract = prePopulatedContracts.find((c) => bytes.isEqual(c.address, normalizedAddress));
      if (prePopulatedContract) {
        allResolvedContracts.add(normalizedAddress);
        res[normalizedAddress] = [prePopulatedContract];
        continue;
      }

      let resolvedContracts: Contract[];
      try {
        resolvedContracts = await tracerDeps.resolveContract(networkName, normalizedAddress);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `Failed to resolve contract info for ${normalizedAddress} on "${networkName}": ${errorMessage}. ` +
            `Falling back to raw trace decoding.`,
        );

        resolvedContracts = [{ address: normalizedAddress, abi: [], label: `Contract[${normalizedAddress}]` }];
      }

      allResolvedContracts.add(normalizedAddress);
      res[normalizedAddress] = resolvedContracts;
    }
    return res;
  }
}
