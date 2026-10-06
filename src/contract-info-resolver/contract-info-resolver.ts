import { ContractInfoInMemoryCache, ContractInfoPersistentJsonCache } from "./contract-info-cache";
import type { ContractInfoCache } from "./types";
import { Address } from "../common/types";
import { NetworkName } from "../network";
import { EtherscanContractInfoProvider } from "./etherscan-contract-info-provider";

export class ContractInfoResolver {
  public static cache: ContractInfoCache | undefined = undefined;
  public static etherscanProvider: EtherscanContractInfoProvider | undefined = undefined;

  public static disableCache() {
    this.cache = undefined;
  }

  public static enableInMemoryCache() {
    this.cache = new ContractInfoInMemoryCache();
  }

  public static enablePersistentJsonCache(cacheDirPath: string) {
    this.cache = ContractInfoPersistentJsonCache.create(cacheDirPath);
  }

  public static setEtherscanToken(token: string) {
    this.etherscanProvider = new EtherscanContractInfoProvider(token);
  }

  public static async resolve(networkName: NetworkName, address: Address) {
    if (!this.etherscanProvider) {
      throw new Error(`Etherscan Tokens wasn't set. Use "ContractInfoResolver.setEtherscanToken() to set token"`);
    }
    const cacheRes = await this.cache?.get(networkName, address);
    if (cacheRes) return cacheRes;

    const res = await this.etherscanProvider.request(networkName, address);
    await this.cache?.set(networkName, address, res);
    return res;
  }
}
