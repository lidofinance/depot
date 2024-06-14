import type { JsonFragment, ContractRunner, BaseContract } from "ethers";
import { ChainName } from "../networks";

export type ChainId = string | number | bigint;

export type NamedContract<T extends BaseContract = BaseContract, A extends Address = Address> = T & {
  address: A;
  name: string;
};

export interface ContractFactory<T extends BaseContract = BaseContract> {
  connect(address: string, runner?: ContractRunner | null | undefined): T;
}

export interface ContractConfig<Factory extends ContractFactory = ContractFactory> {
  title?: string;
  factory: Factory;
  address: Address;
}

export interface ProxiableContractConfig<
  ImplFactory extends ContractFactory = ContractFactory,
  ProxyFactory extends ContractFactory = ContractFactory,
> {
  chain?: ChainName;
  impl: ContractConfig<ImplFactory>;
  proxy: ContractConfig<ProxyFactory> | null;
}

export interface ContractsConfig {
  [key: string]: ContractsConfig | ProxiableContractConfig;
}

export interface NamedContractData {
  name: string;
  abi: JsonFragment[];
  isProxy: boolean;
  implementation?: Address;
}

export interface NamedContractDataCache {
  get(chainId: ChainId, address: Address): Promise<NamedContractData | null>;
  set(chainId: ChainId, address: Address, abi: NamedContractData): Promise<void>;
}

export interface NamedContractDataResolver {
  resolve(chainId: ChainId, address: Address): Promise<NamedContractData | null>;
}
