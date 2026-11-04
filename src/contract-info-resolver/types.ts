import { Abi } from "abitype";

import { Address } from "../common/types";

import { NetworkName } from "../network";

export interface ContractInfoProvider {
  request(networkName: NetworkName, address: Address): Promise<ContractInfo>;
}

export interface ContractInfo {
  name: string;
  abi: Abi;
  // if the contract is not proxy the address will null
  implementation: Address | null;
}

export interface ContractInfoCache {
  get(networkName: NetworkName, address: Address): Promise<ContractInfo | null>;
  set(networkName: NetworkName, address: Address, abi: ContractInfo): Promise<void>;
}
