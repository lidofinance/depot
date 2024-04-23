import { ContractTransactionReceipt, JsonRpcProvider } from 'ethers'

import bytes from '../common/bytes'
import { TxTraceItem } from './tx-traces'
import { DebugTraceTxStreamed } from './debug-trace-tx-streamed'
import { StructLogsTracingVisitor } from './struct-log-tracing-visitor'

export interface TraceStrategy {
  trace(receipt: ContractTransactionReceipt): Promise<TxTraceItem[]>
}

export class DebugTxTraceStrategy implements TraceStrategy {
  private readonly provider: JsonRpcProvider

  constructor(provider: JsonRpcProvider) {
    this.provider = provider
  }

  async trace(receipt: ContractTransactionReceipt): Promise<TxTraceItem[]> {
    const tx = await receipt.getTransaction()
    const structLogVisitor = new StructLogsTracingVisitor({
      address: bytes.normalize(receipt.to ?? '0x'),
      gasLimit: Number(tx.gasLimit),
      data: bytes.normalize(tx.data),
      value: tx.value,
    })
    const tracer = new DebugTraceTxStreamed(
      {
        structLog: (log) => structLogVisitor.visit(log),
        error: (error) => {
          if (error) {
            throw new Error(error.message)
          }
        },
      },
      { enableMemory: true, disableStack: false, disableStorage: true, enableReturnData: false },
    )
    await tracer.trace(this.provider._getConnection().url, receipt.hash)
    return structLogVisitor.finalize()
  }
}
