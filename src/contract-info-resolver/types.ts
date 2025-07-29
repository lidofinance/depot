import { Abi } from "abitype";

import { HexStr } from "../common/bytes";
import { Address } from "../common/types";

import { ChainId, NetworkName } from "../network";

export interface ContractInfoProvider {
  request(networkName: NetworkName, address: Address): Promise<ContractInfo>;
}

export interface ContractInfo {
  name: string;
  abi: Abi;
  // if the contract is not proxy the address will null
  implementation: Address | null;
  constructorArgs: HexStr;
  sourceCode: string;
  evmVersion: string;
  compilerVersion: string;
}

export interface ContractInfoCache {
  get(networkName: NetworkName, address: Address): Promise<ContractInfo | null>;
  set(networkName: NetworkName, address: Address, abi: ContractInfo): Promise<void>;
}
