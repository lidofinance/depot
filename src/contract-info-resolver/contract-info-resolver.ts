import { Address } from "../common/types";
import { NetworkName } from "../network";
import { EtherscanContractInfoProvider } from "./etherscan-contract-info-provider";
import { ContractInfo } from "./types";

export class ContractInfoResolver {
  private static etherscanProvider: EtherscanContractInfoProvider | undefined = undefined;
  private static readonly cache = new Map<string, ContractInfo>();

  public static setEtherscanToken(token: string) {
    this.etherscanProvider = new EtherscanContractInfoProvider(token);
  }

  public static async resolve(networkName: NetworkName, address: Address) {
    if (!this.etherscanProvider) {
      throw new Error(`Etherscan Tokens wasn't set. Use "ContractInfoResolver.setEtherscanToken() to set token"`);
    }
    const cacheKey = `${networkName}:${address}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const contractInfo = await this.etherscanProvider.request(networkName, address);
    this.cache.set(cacheKey, contractInfo);
    return contractInfo;
  }
}
