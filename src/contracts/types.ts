import type { JsonFragment, ContractRunner, BaseContract } from "ethers";

interface ContractLabel {
  label: string;
}
export type LabeledContract<T extends BaseContract = BaseContract> = T &
  Addressable &
  ContractLabel;

export interface ContractFactory<T extends BaseContract = BaseContract> {
  connect(address: string, runner?: ContractRunner | null): T;
}

export type FactoryAddressTuple<Factory extends ContractFactory = ContractFactory> = readonly [
  Factory,
  Address,
];

export interface ContractConfig<
  ImplFactory extends ContractFactory = ContractFactory,
  ProxyFactory extends ContractFactory = ContractFactory,
> {
  impl: FactoryAddressTuple<ImplFactory>;
  proxy: FactoryAddressTuple<ProxyFactory> | null;
}

export type ContractsConfig = Record<string, ContractConfig>;

export interface ContractAbi {
  name: string;
  abi: JsonFragment[];
  isProxy: boolean;
  implementation?: Address;
}

export interface ContractAbiCache {
  get(network: NetworkName, address: Address): Promise<ContractAbi | null>;
  set(network: NetworkName, address: Address, abi: ContractAbi): Promise<void>;
}

export interface ContractAbiResolver {
  resolve(network: NetworkName, address: Address): Promise<ContractAbi | null>;
}

export interface ContractsResolver {
  resolve(
    network: NetworkName,
    address: Address,
    runner?: ContractRunner | null,
  ): Promise<LabeledContract | null>;
}
