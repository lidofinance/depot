import { Network } from 'ethers'

import networks, { NetworkName } from '../../src/networks'
import providers from '../../src/providers'

export async function getProviderWithInfo(networkName: NetworkName, rpc: 'local' | 'remote', blockNumber?: number) {
  if (rpc === 'remote') {
    console.log(`Running on the remote RPC node on network "${networkName}"`)
  } else {
    const url = networks.localRpcUrl('eth')
    console.log(
      `Running on the local RPC node on url ${url}. Expected network ${networkName}, expected blockNumber ${
        blockNumber ?? '"any"'
      }`,
    )
  }
  const provider = await providers.getProvider(networkName, rpc, blockNumber)
  printNetworkInfo(await provider.getNetwork(), rpc)
  return provider
}

function printNetworkInfo(network: Network, rpc?: 'local' | 'remote') {
  console.log(`Network:`)
  console.log(`  - rpc: ${rpc}`)
  console.log(`  - name: ${network.name}`)
  console.log(`  - chainId: ${network.chainId}\n`)
}
