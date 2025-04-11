import { ContractRunner, JsonRpcProvider } from 'ethers'

import networks, { NetworkName } from '../networks'

import { cheats } from './cheats'
import { RpcProvider } from './types'
import { isHardhatEthersProvider, isJsonRpcProvider, UnsupportedProviderError } from './utils'

function provider(runner: ContractRunner): RpcProvider {
  const { provider } = runner

  if (!provider) {
    throw new Error('Provider is empty')
  }

  if (!isJsonRpcProvider(provider) && !isHardhatEthersProvider(provider)) {
    throw new UnsupportedProviderError(provider)
  }
  return provider as RpcProvider
}

async function chainId(runner: ContractRunner): Promise<bigint> {
  const { chainId } = await provider(runner).getNetwork()
  return chainId
}

// async function seek(provider: RpcProvider, timestamp: number): Promise<Block> {
//   const blockNumber = await provider.getBlockNumber()
//
//   let block = await provider.getBlock(blockNumber)
//   if (!block) {
//     throw new Error(`Block ${blockNumber} not found`)
//   }
//
//   if (timestamp > block.timestamp) {
//     throw new Error(`The date is in the future`)
//   }
//
//   while (true) {
//     const delta = block.timestamp - timestamp
//     if (Math.abs(delta) < 3600) break
//     const estimatedBlockNumber: number = block.number - Math.floor(delta / 14)
//     block = await provider.getBlock(estimatedBlockNumber)
//     if (!block) {
//       throw new Error(`Block ${blockNumber} not found`)
//     }
//   }
//   return block
// }

async function getProvider(network: NetworkName, rpc: 'local' | 'remote', blockNumber?: number) {
  if (rpc === 'remote') {
    return new JsonRpcProvider(networks.rpcUrl('eth', network))
  }
  const url = networks.localRpcUrl('eth')
  const provider = new JsonRpcProvider(url)
  if (blockNumber !== undefined) {
    const currentBlockNumber = await provider.getBlockNumber()
    if (currentBlockNumber !== blockNumber) {
      throw new Error(
        `Local RPC node set on the wrong block number. Expected ${blockNumber}, actual: ${currentBlockNumber}`,
      )
    }
  }
  return provider
}

export default { cheats, provider, chainId, getProvider }
