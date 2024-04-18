import bytes from '../common/bytes'
import { JsonRpcSigner } from 'ethers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { UnsupportedProviderError, isHardhatEthersProvider, isJsonRpcProvider } from './utils'
import { RpcProvider, SignerWithAddress, SnapshotRestorer } from './types'
import { Address } from '../common/types'

type NodeName = 'hardhat' | 'anvil' | 'ganache'

interface LocalNodeInfo {
  name: NodeName
  version: string
}

class UnsupportedRpcNode extends Error {
  constructor(info: string) {
    super(`Node ${info} is not supported`)
  }
}

class InvalidEvmSnapshotResult extends Error {
  constructor() {
    super('The value returned by evm_snapshot should be a string')
  }
}

class InvalidEvmRevertResult extends Error {
  constructor() {
    super('The value returned by evm_revert should be a boolean')
  }
}

export interface ProviderCheats {
  node(): Promise<LocalNodeInfo>
  signers(): Promise<SignerWithAddress[]>
  increaseTime(seconds: number | bigint): Promise<void>
  mine(): Promise<void>
  snapshot(): Promise<SnapshotRestorer>
  revert(snapshotId: string): Promise<void>
  setCode(address: Address, code: string): Promise<void>
  setBalance(address: Address, balance: bigint): Promise<void>
  unlock(address: Address, balance?: bigint): Promise<SignerWithAddress>
  lock(address: Address, balance?: bigint): Promise<void>
  reset(params?: { jsonRpcUrl?: string; blockNumber?: number }): Promise<void>
}

async function fetchNodeInfo<T extends RpcProvider>(provider: T): Promise<LocalNodeInfo> {
  const clientInfo: string = await provider.send('web3_clientVersion', [])
  const [name = 'unknown', version = '-1'] = clientInfo.toLowerCase().split('/')

  if (name.startsWith('anvil')) return { name: 'anvil', version }
  if (name.startsWith('hardhat')) return { name: 'hardhat', version }
  if (name.startsWith('ganache')) return { name: 'ganache', version }
  throw new UnsupportedRpcNode(clientInfo)
}

async function sendMine(node: LocalNodeInfo, provider: RpcProvider, blocks: number): Promise<unknown> {
  switch (node.name) {
    case 'anvil':
      return provider.send('anvil_mine', [blocks])
    case 'hardhat':
      return provider.send('hardhat_mine', ['0x' + blocks.toString(16)])
    case 'ganache':
      return provider.send('evm_mine', [{ blocks }])
  }
}

function signer(provider: RpcProvider, address: Address): Promise<SignerWithAddress> {
  if (isJsonRpcProvider(provider)) {
    return Promise.resolve(new JsonRpcSigner(provider, address) as SignerWithAddress)
  } else if (isHardhatEthersProvider(provider)) {
    return HardhatEthersSigner.create(provider, address) as Promise<SignerWithAddress>
  } else {
    throw new UnsupportedProviderError(provider)
  }
}

async function sendImpersonate(node: LocalNodeInfo, provider: RpcProvider, address: Address): Promise<unknown> {
  switch (node.name) {
    case 'anvil':
      // hardhat returns null by default
      await provider.send('anvil_impersonateAccount', [address])
      return true
    case 'hardhat':
      return provider.send('hardhat_impersonateAccount', [address])
    case 'ganache':
      await provider.send('evm_addAccount', [address, ''])
      return provider.send('personal_unlockAccount', [address, ''])
  }
}

async function sendSetCode(
  node: LocalNodeInfo,
  provider: RpcProvider,
  address: Address,
  code: string,
): Promise<unknown> {
  const params = [address, code]

  switch (node.name) {
    case 'anvil':
      return provider.send('anvil_setCode', params)
    case 'hardhat':
      return provider.send('hardhat_setCode', params)
    case 'ganache':
      return provider.send('evm_setAccountCode', params)
  }
}

async function sendSetBalance(
  node: LocalNodeInfo,
  provider: RpcProvider,
  address: Address,
  balance: bigint,
): Promise<unknown> {
  const params = [address, bytes.encode(balance)]

  switch (node.name) {
    case 'anvil':
      return provider.send('anvil_setBalance', params)
    case 'hardhat':
      return provider.send('hardhat_setBalance', params)
    case 'ganache':
      return provider.send('evm_setAccountBalance', params)
  }
}

async function sendReset(
  node: LocalNodeInfo,
  provider: RpcProvider,
  jsonRpcUrl?: string,
  blockNumber?: number,
): Promise<unknown> {
  const params: { forking?: { jsonRpcUrl?: string; blockNumber?: number } } = {}
  if (jsonRpcUrl !== undefined) {
    if (!params.forking) {
      params.forking = {}
    }
    params.forking.jsonRpcUrl = jsonRpcUrl
  }
  if (blockNumber !== undefined) {
    if (!params.forking) {
      params.forking = {}
    }
    params.forking.blockNumber = blockNumber
  }
  switch (node.name) {
    case 'anvil':
      return provider.send('anvil_reset', [params])
    case 'hardhat':
      return provider.send('hardhat_reset', [params])
    case 'ganache':
      throw new Error(`Ganache node does not support resetting`)
  }
}

async function sendLock(node: LocalNodeInfo, provider: RpcProvider, address: Address): Promise<unknown> {
  switch (node.name) {
    case 'anvil':
      return provider.send('anvil_stopImpersonatingAccount', [address])
    case 'hardhat':
      return provider.send('hardhat_stopImpersonatingAccount', [address])
    case 'ganache':
      return provider.send('personal_lockAccount', [address])
  }
}

export function cheats(provider: RpcProvider): ProviderCheats {
  let cachedNode: LocalNodeInfo | undefined

  async function revert(snapshotId: string): Promise<void> {
    const reverted = await provider.send('evm_revert', [snapshotId])

    if (typeof reverted !== 'boolean') {
      throw new InvalidEvmRevertResult()
    }

    if (!reverted) {
      throw new Error('Revert to snapshot failed')
    }
  }

  async function node(): Promise<LocalNodeInfo> {
    if (!cachedNode) {
      cachedNode = await fetchNodeInfo(provider)
    }
    return cachedNode
  }

  async function signers(): Promise<SignerWithAddress[]> {
    const accounts: Address[] = await provider.send('eth_accounts', [])
    return Promise.all(accounts.map((address) => signer(provider, address)))
  }

  async function mine(blocks: number = 1): Promise<void> {
    await sendMine(await node(), provider, blocks)
  }

  async function increaseTime(seconds: number | bigint): Promise<void> {
    await provider.send('evm_increaseTime', [bytes.encode(seconds)])
  }

  async function snapshot(): Promise<SnapshotRestorer> {
    let snapshotId = await provider.send('evm_snapshot', [])

    if (typeof snapshotId !== 'string') {
      throw new InvalidEvmSnapshotResult()
    }

    return {
      revert: async () => {
        await revert(snapshotId)
      },
      restore: async () => {
        await revert(snapshotId)
        // re-take the snapshot so that `restore` can be called again
        snapshotId = await provider.send('evm_snapshot', [])
      },
      snapshotId,
    }
  }

  async function setCode(address: Address, code: string): Promise<void> {
    const success = await sendSetCode(await node(), provider, address, code)

    if (!success) {
      throw new Error(`Can't set the code for ${address}`)
    }
  }

  async function setBalance(address: Address, balance: bigint): Promise<void> {
    const success = await sendSetBalance(await node(), provider, address, balance)
    if (success === false) {
      throw new Error(`Can't set the balance for ${address}`)
    }
  }
  async function unlock(address: Address, balance?: bigint) {
    const success = await sendImpersonate(await node(), provider, address)
    if (success === false) {
      throw new Error(`Can't unlock the account ${address}`)
    }
    if (balance !== undefined) {
      await sendSetBalance(await node(), provider, address, balance)
    }

    return signer(provider, address)
  }

  async function lock(address: Address, balance?: bigint): Promise<void> {
    const success = await sendLock(await node(), provider, address)
    if (success === false) {
      throw new Error(`Can't lock the account ${address}`)
    }
    if (balance !== undefined) {
      await sendSetBalance(await node(), provider, address, balance)
    }
  }

  async function reset(params?: { jsonRpcUrl?: string; blockNumber?: number }): Promise<void> {
    await sendReset(await node(), provider, params?.jsonRpcUrl, params?.blockNumber)
  }

  return {
    node,
    mine,
    signers,
    revert,
    snapshot,
    setCode,
    setBalance,
    increaseTime,
    unlock,
    lock,
    reset,
  }
}
