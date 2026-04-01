import 'dotenv/config'
import { HardhatUserConfig } from 'hardhat/config'
import '@typechain/hardhat'
import '@nomicfoundation/hardhat-ethers'

if (!process.env.SKIP_TYPECHAIN) {
  // this is required to allow build the typechain types at the first launch ??
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./tasks/omnibuses')
}
import './src/hardhat-keystores'

import networks from './src/networks'

const config: HardhatUserConfig = {
  solidity: '0.8.23',
  networks: {
    hardhat: {
      hardfork: 'merge',
      chainId: 1,
      forking: {
        url: networks.rpcUrl('eth', 'mainnet'),
      },
    },
    'holesky-fork': {
      hardfork: 'merge',
      chainId: 17000,
      url: networks.rpcUrl('eth', 'holesky'),
    },
    holesky: {
      chainId: 17000,
      url: networks.rpcUrl('eth', 'holesky'),
    },
  },
  typechain: {
    externalArtifacts: ['interfaces/*.json'],
  },
  mocha: {
    timeout: 5 * 60 * 10000,
  },
  keystores: {
    path: 'keystores',
  },
}

export default config
