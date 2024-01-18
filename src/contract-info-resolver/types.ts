import { HexStrPrefixed } from "../common/bytes";

export type ChainId = number | bigint | string;
export type Address = `0x${string}`;

type AbiElementType = "function" | "constructor" | "receive" | "fallback";
type AbiElementStateMutability = "pure" | "view" | "nonpayable" | "payable";

interface AbiFunctionParameter {
  name: string;
  type: unknown;
  components: unknown;
}

interface AbiFragment {
  type: AbiElementType;
  name?: string;
  inputs?: AbiFunctionParameter[];
  outputs?: AbiFunctionParameter[];
  stateMutability: AbiElementStateMutability;
}

export interface ContractInfoProvider {
  request(
    chainId: ChainId,
    address: Address,
  ): Promise<[res: ContractInfo | null, err: null | string]>;
}

export interface ContractInfo {
  name: string;
  abi: AbiFragment;
  // if the contract is not proxy the address will null
  implementation: Address | null;
  constructorArgs: HexStrPrefixed;
  sourceCode: string;
  evmVersion: string;
  compilerVersion: string;
}

export interface ContractInfoCache {
  get(chainId: ChainId, address: Address): Promise<ContractInfo | null>;
  set(chainId: ChainId, address: Address, abi: ContractInfo): Promise<void>;
}
