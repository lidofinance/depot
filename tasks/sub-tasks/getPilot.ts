import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { Wallet } from 'ethers'
import type { JsonRpcProvider } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import votes from '../../src/aragon-votes-tools'
import bytes from '../../src/common/bytes'
import format from '../../src/common/format'

export const getPilot = async (
  provider: JsonRpcProvider | HardhatEthersProvider,
  hre: HardhatRuntimeEnvironment,
  testAccount?: boolean,
) => {
  const pilot = testAccount
    ? await votes.creator(provider)
    : await hre.keystores.unlock().then((privateKey) => new Wallet(privateKey, provider))

  console.log(`Deployer ${format.address(bytes.normalize(await pilot.getAddress()))}`)
  console.log(`  - nonce: ${await pilot.getNonce()}`)
  console.log(`  - balance: ${hre.ethers.formatEther(await provider.getBalance(pilot))} ETH\n`)

  return pilot
}
