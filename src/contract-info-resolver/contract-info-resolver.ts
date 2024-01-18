import { ContractInfoInMemoryCache } from "./contract-info-cache";
import type { ChainId, ContractInfo, ContractInfoProvider, ContractInfoCache } from "./types";

interface AbiResolverOptions {
  provider: ContractInfoProvider;
  cache?: ContractInfoCache | null;
}

export class ContractInfoResolver {
  public readonly cache: ContractInfoCache | null;
  public readonly provider: ContractInfoProvider;
  constructor({ provider, cache }: AbiResolverOptions) {
    this.provider = provider;
    if (cache === undefined) {
      this.cache = new ContractInfoInMemoryCache();
    } else {
      this.cache = cache;
    }
  }

  async resolve(chainId: ChainId, address: Address): Promise<{ res: ContractInfo; err: null }>;
  async resolve(chainId: ChainId, address: Address): Promise<{ res: null; err: string }>;
  async resolve(
    chainId: ChainId,
    address: Address,
  ): Promise<{ res: ContractInfo | null; err: string | null }> {
    const cacheRes = await this.cache?.get(chainId, address);
    if (cacheRes) return { res: cacheRes, err: null };
    const [res, err] = await this.provider.request(chainId, address);
    if (err !== null) return { res: null, err };
    if (res === null) {
      throw new Error(`Result is null`);
    }
    await this.cache?.set(chainId, address, res);

    return { res, err: null };
  }
}
