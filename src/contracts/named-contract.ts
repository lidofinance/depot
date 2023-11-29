import { BaseContract, ContractRunner, JsonFragment } from "ethers";
import { ProxiableContractConfig, ContractFactory, NamedContract } from "./types";

export class Contract__factory<T extends BaseContract = BaseContract> implements ContractFactory {
  public readonly abi: JsonFragment[];

  constructor(abi: JsonFragment[]) {
    this.abi = abi;
  }

  connect(address: string, runner?: ContractRunner | null | undefined): T {
    return new BaseContract(address, this.abi, runner) as T;
  }
}

function extend<T extends BaseContract>(
  contract: T,
  props: { address: Address; name: string }
): NamedContract<T> {
  const _connect = contract.connect.bind(contract);

  const connect = (runner?: null | ContractRunner): NamedContract<T> =>
    Object.assign(_connect(runner ?? null) as T, { ...props, connect });

  return Object.assign(contract, { ...props, connect });
}

export class NamedContractsBuilder {
  static isProxy<C extends ProxiableContractConfig>(config: C) {
    return !!config.proxy;
  }

  static buildContract<C extends ProxiableContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner
  ): NamedContract {
    const { impl, proxy } = config;
    const address = proxy ? proxy.address : impl.address;
    return extend(impl.factory.connect(address, runner), {
      address,
      name: proxy ? this.labelProxy(contractName) : this.labelContract(contractName),
    });
  }

  static buildProxy<C extends ProxiableContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner
  ): NamedContract | null {
    if (!config.proxy) return null;
    const { address, factory } = config.proxy;
    return extend(factory.connect(address, runner), {
      address,
      name: this.labelProxy(contractName),
    });
  }

  static buildImpl<C extends ProxiableContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner
  ): NamedContract | null {
    if (!config.proxy) return null;
    const { address, factory } = config.impl;
    return extend(factory.connect(address, runner), {
      address,
      name: this.labelImpl(contractName),
    });
  }

  private static labelContract(contractLabel: string) {
    return contractLabel.charAt(0).toUpperCase() + contractLabel.slice(1);
  }

  private static labelProxy(contractLabel: string) {
    return this.labelContract(contractLabel) + "__Proxy";
  }

  private static labelImpl(contractLabel: string) {
    return this.labelContract(contractLabel) + "__Impl";
  }
}
