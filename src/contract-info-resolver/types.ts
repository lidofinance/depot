import { HexStr } from '../common/bytes'
import { Address } from '../common/types'

export type ChainId = number | bigint | string

type AbiElementType = 'function' | 'constructor' | 'receive' | 'fallback'
type AbiElementStateMutability = 'pure' | 'view' | 'nonpayable' | 'payable'

interface AbiFunctionParameter {
  name: string
  type: string
  internalType: string
  components?: string
}

interface AbiFragment {
  type: AbiElementType
  name?: string
  inputs?: AbiFunctionParameter[]
  outputs?: AbiFunctionParameter[]
  stateMutability: AbiElementStateMutability
}

export interface ContractInfoProvider {
  request(chainId: ChainId, address: Address): Promise<ContractInfo>
}

export interface ContractInfo {
  name: string
  abi: AbiFragment[]
  // if the contract is not proxy the address will null
  implementation: Address | null
  constructorArgs: HexStr
  sourceCode: string
  evmVersion: string
  compilerVersion: string
}

export interface ContractInfoCache {
  get(chainId: ChainId, address: Address): Promise<ContractInfo | null>
  set(chainId: ChainId, address: Address, abi: ContractInfo): Promise<void>
}
