import { ContractInfoInMemoryCache } from "./contract-info-cache";
import type { ContractInfo, ContractInfoProvider, ContractInfoCache } from "./types";
import { Address } from "../common/types";
import { NetworkName } from "../network";

interface AbiResolverOptions {
  contractInfoProvider: ContractInfoProvider;
  cache?: ContractInfoCache | undefined;
}

export class ContractInfoResolver {
  public readonly cache: ContractInfoCache | undefined;
  public readonly provider: ContractInfoProvider;

  constructor({ contractInfoProvider, cache }: AbiResolverOptions, cacheEnabled: boolean = false) {
    this.provider = contractInfoProvider;
    if (!cacheEnabled) return;
    if (cache === undefined) {
      this.cache = new ContractInfoInMemoryCache();
    } else {
      this.cache = cache;
    }
  }

  async resolve(networkName: NetworkName, address: Address): Promise<ContractInfo> {
    const cacheRes = await this.cache?.get(networkName, address);
    if (cacheRes) return cacheRes;

    const res = await this.provider.request(networkName, address);
    await this.cache?.set(networkName, address, res);
    return res;
  }
}
