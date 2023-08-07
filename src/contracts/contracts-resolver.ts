import { ContractRunner } from "ethers";

import { ContractAbiMemoryCache } from "./contracts-abi-chache";
import { BaseContract__factory, LabeledContractBuilder } from "./labeled-contract";
import type { ContractAbiResolver, ContractAbiCache, ContractsResolver } from "./types";

export class CachedContractsResolver implements ContractsResolver {
  private readonly cache: ContractAbiCache;
  private readonly contractAbiResolver: ContractAbiResolver[];

  constructor(
    contractAbiResolvers: ContractAbiResolver[],
    cache: ContractAbiCache = new ContractAbiMemoryCache(),
  ) {
    this.cache = cache;
    this.contractAbiResolver = contractAbiResolvers;
  }

  async resolve(network: NetworkName, address: Address, runner: ContractRunner | null = null) {
    const contractAbi = await this.resolveContractAbi(network, address);
    if (!contractAbi) return null;

    const contractAbiProxy = contractAbi.isProxy ? contractAbi : null;

    const implAddress = contractAbi.implementation || address;
    const contractAbiImpl = contractAbi.implementation
      ? await this.resolveContractAbi(network, contractAbi.implementation)
      : contractAbi;

    if (!contractAbiImpl) return null;

    return LabeledContractBuilder.build(
      contractAbiImpl.name,
      {
        impl: [new BaseContract__factory(contractAbiImpl.abi), implAddress],
        proxy: contractAbiProxy ? [new BaseContract__factory(contractAbiProxy.abi), address] : null,
      },
      runner,
    );
  }

  private async resolveContractAbi(network: NetworkName, address: Address) {
    let contractAbi = await this.resolveContractAbiWithCache(network, address);
    if (!contractAbi) {
      contractAbi = await this.resolveContractAbiWithProviders(network, address);
    }
    return contractAbi;
  }

  private async resolveContractAbiWithCache(network: NetworkName, address: Address) {
    if (!this.cache) return null;
    const cachedContractAbi = await this.cache.get(network, address);
    return cachedContractAbi || null;
  }

  private async resolveContractAbiWithProviders(network: NetworkName, address: Address) {
    for (const labeledAbiProvider of this.contractAbiResolver) {
      const contractAbi = await labeledAbiProvider.resolve(network, address);
      if (!contractAbi) continue;
      await this.cache?.set(network, address, contractAbi);
      return contractAbi;
    }
    return null;
  }
}
