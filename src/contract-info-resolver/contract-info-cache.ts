import { Address } from "../common/types";
import { ContractInfo, ContractInfoCache } from "./types";
import { NetworkName } from "../network";

export class ContractInfoInMemoryCache implements ContractInfoCache {
  private data: Partial<Record<string, Record<Address, ContractInfo>>> = {};

  // async required by ContractInfoCache interface
  // eslint-disable-next-line @typescript-eslint/require-await
  async get(networkName: NetworkName, address: Address) {
    return this.data[networkName.toString()]?.[address] ?? null;
  }

  // async required by ContractInfoCache interface
  // eslint-disable-next-line @typescript-eslint/require-await
  async set(networkName: NetworkName, address: Address, contractInfo: ContractInfo) {
    if (!this.data[networkName.toString()]) {
      this.data[networkName.toString()] = {};
    }
    this.data[networkName.toString()]![address] = contractInfo;
  }

  // async required by ContractInfoCache interface
  // eslint-disable-next-line @typescript-eslint/require-await
  async clearAll(): Promise<void> {
    this.data = {};
  }
}
