import { ContractTransactionReceipt } from 'ethers'

import bytes from '../common/bytes'
import providers from '../providers'
import { TraceStrategy } from './debug-trace-tx-strategy'
import { isCallOpcode, isCreateOpcode } from './evm-opcodes'
import { ContractInfo } from '../contract-info-resolver/types'
import { TxTrace, TxTraceCallItem, TxTraceCreateItem } from './tx-traces'
import { ContractInfoResolver } from '../contract-info-resolver/contract-info-resolver'
import { Address } from '../common/types'

export class TxTracer {
  constructor(
    private readonly traceStrategy: TraceStrategy,
    private readonly contractInfoResolver?: ContractInfoResolver | null,
  ) {}

  async trace(receipt: ContractTransactionReceipt) {
    const callTraceItems = await this.traceStrategy.trace(receipt)

    const addresses = new Set<Address>()
    for (let callTraceItem of callTraceItems) {
      if (isCallOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCallItem).address)
      } else if (isCreateOpcode(callTraceItem.type)) {
        addresses.add((callTraceItem as TxTraceCreateItem).address)
      }
    }
    const contracts = await this.resolveContracts(await providers.chainId(receipt), Array.from(addresses))
    const network = await providers.provider(receipt).getNetwork()
    return new TxTrace(network, bytes.normalize(receipt.from), callTraceItems, contracts)
  }

  private async resolveContracts(chainId: bigint, addresses: Address[]): Promise<Record<Address, ContractInfo>> {
    const res: Record<Address, ContractInfo> = {}
    if (!this.contractInfoResolver) return res
    const resolvedContracts = new Set<Address>()
    for (const address of addresses) {
      if (resolvedContracts.has(address)) continue
      resolvedContracts.add(address)
      let { res: contract } = await this.contractInfoResolver.resolve(chainId, address)
      if (contract) {
        if (contract.implementation) {
          const { res: implementation } = await this.contractInfoResolver.resolve(chainId, contract.implementation)
          res[address] = implementation
        } else {
          res[address] = contract
        }
      }
    }
    return res
  }
}
