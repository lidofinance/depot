import { ContractRunner } from "ethers";

import {
  NamedContractDataJsonCache,
  NamedContractDataMemoryCache,
} from "./named-contracts-data-chache";
import { ChainId } from "../common/types";
import { Contract__factory, NamedContractsBuilder } from "./named-contract";
import type { NamedContractDataCache, NamedContractDataResolver } from "./types";
import { EtherscanContractDataResolver } from "./etherscan-contract-data-resolver";
import { EtherscanChainConfig } from "./etherscan-chains-config";

export class NamedContractsResolver {
  private readonly dataCache: NamedContractDataCache;
  private readonly dataResolvers: NamedContractDataResolver[];

  private static etherscanToken: string | null = null;
  private static jsonCachePath: string | null = null;
  private static customEtherscanChains: EtherscanChainConfig[] | null = null;
  private static singletonInstance: NamedContractsResolver | null = null;

  public static setEtherscanToken(token: string) {
    this.etherscanToken = token;
  }

  public static setCustomEtherscanChains(chains: EtherscanChainConfig[]) {
    this.customEtherscanChains = chains;
  }

  public static setJsonCachePath(path: string) {
    this.jsonCachePath = path;
  }

  public static singleton(): NamedContractsResolver {
    if (this.singletonInstance) return this.singletonInstance;

    if (!this.etherscanToken) {
      throw new Error(
        `Etherscan token was not set. Please call the ${this.name}.setEtherscanToken() before the usage`,
      );
    }

    const cache = this.jsonCachePath
      ? NamedContractDataJsonCache.create(this.jsonCachePath)
      : new NamedContractDataMemoryCache();
    return new NamedContractsResolver(
      [new EtherscanContractDataResolver(this.etherscanToken, this.customEtherscanChains ?? [])],
      cache,
    );
  }

  constructor(
    contractAbiResolvers: NamedContractDataResolver[],
    cache: NamedContractDataCache = new NamedContractDataMemoryCache(),
  ) {
    this.dataCache = cache;
    this.dataResolvers = contractAbiResolvers;
  }

  async resolve(chainId: ChainId, address: Address, runner?: ContractRunner) {
    const contractAbi = await this.getOrResolveContractData(chainId, address);
    if (!contractAbi) return null;

    const contractAbiProxy = contractAbi.isProxy ? contractAbi : null;

    const implAddress = contractAbi.implementation || address;
    const contractAbiImpl = contractAbi.implementation
      ? await this.getOrResolveContractData(chainId, contractAbi.implementation)
      : contractAbi;

    if (!contractAbiImpl) return null;

    return NamedContractsBuilder.buildContract(
      contractAbiImpl.name,
      {
        impl: {
          factory: new Contract__factory(contractAbiImpl.abi),
          address: implAddress,
        },
        proxy: contractAbiProxy
          ? {
              factory: new Contract__factory(contractAbiProxy.abi),
              address,
            }
          : null,
      },
      runner,
    );
  }

  private async getOrResolveContractData(chainId: ChainId, address: Address) {
    let contractData = await this.getContractData(chainId, address);
    if (!contractData) {
      contractData = await this.resolveContractData(chainId, address);
    }
    return contractData;
  }

  private async getContractData(chainId: ChainId, address: Address) {
    if (!this.dataCache) return null;
    const cachedContractAbi = await this.dataCache.get(chainId, address);
    return cachedContractAbi || null;
  }

  private async resolveContractData(chainId: ChainId, address: Address) {
    for (const namedContractDataResolvers of this.dataResolvers) {
      const contractAbi = await namedContractDataResolvers.resolve(chainId, address);
      if (!contractAbi) continue;
      await this.dataCache?.set(chainId, address, contractAbi);
      return contractAbi;
    }
    return null;
  }
}
