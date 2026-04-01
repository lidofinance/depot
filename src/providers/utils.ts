import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { JsonRpcProvider } from 'ethers'

export class UnsupportedProviderError extends Error {
  constructor(provider: unknown) {
    super(`Provider ${provider} unsupported`)
  }
}

export function isJsonRpcProvider(provider: unknown): provider is JsonRpcProvider {
  return provider instanceof JsonRpcProvider
}

export function isHardhatEthersProvider(provider: unknown): provider is HardhatEthersProvider {
  return (provider as JsonRpcProvider).constructor?.name === 'HardhatEthersProvider'
}
