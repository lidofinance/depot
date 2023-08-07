import { BaseContract, ContractRunner, JsonFragment } from "ethers";
import { ContractConfig, ContractFactory, LabeledContract } from "./types";

export class BaseContract__factory implements ContractFactory {
  public readonly abi: JsonFragment[];

  constructor(abi: JsonFragment[]) {
    this.abi = abi;
  }

  connect(address: string, runner?: ContractRunner | null | undefined): BaseContract {
    return new BaseContract(address, this.abi, runner);
  }
}

export class LabeledContractBuilder {
  static isProxy<C extends ContractConfig>(config: C) {
    return !!config.proxy;
  }

  static build<C extends ContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner | null,
  ): LabeledContract {
    const Factory = config.impl[0];
    const address = config.proxy ? config.proxy[1] : config.impl[1];
    const instance = Factory.connect(address, runner);
    return Object.assign(instance, {
      address,
      label: config.proxy ? this.labelProxy(contractName) : this.labelContract(contractName),
    });
  }

  static buildProxy<C extends ContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner | null,
  ): LabeledContract | null {
    if (!config.proxy) return null;
    const [Factory, address] = config.proxy;
    const instance = Factory.connect(address, runner);
    return Object.assign(instance, { address, label: this.labelProxy(contractName) });
  }

  static buildImpl<C extends ContractConfig>(
    contractName: string,
    config: C,
    runner?: ContractRunner | null,
  ): LabeledContract | null {
    if (!config.proxy) return null;

    const [Factory, address] = config.impl;
    const instance = Factory.connect(address, runner);
    return Object.assign(instance, { address, label: this.labelImpl(contractName) });
  }

  private static labelContract(contractLabel: string) {
    return contractLabel[0].toUpperCase() + contractLabel.slice(1);
  }

  private static labelProxy(contractLabel: string) {
    return this.labelContract(contractLabel) + "__Proxy";
  }

  private static labelImpl(contractLabel: string) {
    return this.labelContract(contractLabel) + "__Impl";
  }
}
