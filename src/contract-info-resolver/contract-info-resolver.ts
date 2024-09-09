import { ContractInfoInMemoryCache } from "./contract-info-cache";
import type { ChainId, ContractInfo, ContractInfoProvider, ContractInfoCache } from "./types";
import { Address } from "../common/types";
import env from "../common/env";

interface AbiResolverOptions {
  contractInfoProvider: ContractInfoProvider;
  cache?: ContractInfoCache | undefined;
}

export class ContractInfoResolver {
  public readonly cache: ContractInfoCache | undefined;
  public readonly provider: ContractInfoProvider;

  constructor({ contractInfoProvider, cache }: AbiResolverOptions) {
    this.provider = contractInfoProvider;
    if (!env.ETHERSCAN_CACHE_ENABLED()) return;
    if (cache === undefined) {
      this.cache = new ContractInfoInMemoryCache();
    } else {
      this.cache = cache;
    }
  }

  async resolve(chainId: ChainId, address: Address): Promise<ContractInfo> {
    const cachedResponse = await this.cache?.get(chainId, address);
    if (cachedResponse) return cachedResponse;

    const res = await this.provider.request(chainId, address);
    if (res === null) {
      throw new Error(`Result is null`);
    }
    await this.cache?.set(chainId, address, res);

    return res;
  }
}
