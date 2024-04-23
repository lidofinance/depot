import { JsonRpcProvider } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

export class UnsupportedProviderError extends Error {
  constructor(provider: any) {
    super(`Provider ${provider} unsupported`)
  }
}

export function isJsonRpcProvider(provider: unknown): provider is JsonRpcProvider {
  return provider instanceof JsonRpcProvider
}

export function isHardhatEthersProvider(provider: unknown): provider is HardhatEthersProvider {
  return (provider as any).constructor?.name === 'HardhatEthersProvider'
}
