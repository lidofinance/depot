import { ContractInfoInMemoryCache } from "./contract-info-cache";
import type { ChainId, ContractInfo, ContractInfoProvider, ContractInfoCache } from "./types";
import { Address } from "../common/types";

interface AbiResolverOptions {
  contractInfoProvider: ContractInfoProvider;
  cache?: ContractInfoCache | null;
}

export class ContractInfoResolver {
  public readonly cache: ContractInfoCache | null;
  public readonly provider: ContractInfoProvider;

  constructor({ contractInfoProvider, cache }: AbiResolverOptions) {
    this.provider = contractInfoProvider;
    if (cache === undefined) {
      this.cache = new ContractInfoInMemoryCache();
    } else {
      this.cache = cache;
    }
  }

  async resolve(chainId: ChainId, address: Address): Promise<ContractInfo> {
    const cacheRes = await this.cache?.get(chainId, address);
    if (cacheRes) return cacheRes;

    const res = await this.provider.request(chainId, address);
    await this.cache?.set(chainId, address, res);
    return res;
  }
}
