import bytes, { HexStrPrefixed } from "../common/bytes";
import { TxTraceItem } from "./tx-traces";
import { DebugTraceTxStreamed } from "./debug-trace-tx-streamed";
import { StructLogsTracingVisitor } from "./struct-log-tracing-visitor";
import { TraceStrategy } from "./types";
import { RpcClient } from "../network";

export class DebugTxTraceStrategy implements TraceStrategy {
  #client: RpcClient;

  constructor(client: RpcClient) {
    this.#client = client;
  }

  async trace(txHash: HexStrPrefixed): Promise<TxTraceItem[]> {
    const receipt = await this.#client.viemClient.getTransaction({ hash: txHash });
    const structLogVisitor = new StructLogsTracingVisitor({
      address: bytes.normalize(receipt.to ?? "0x"),
      gasLimit: Number(receipt.gas),
      data: bytes.normalize(receipt.input),
      value: receipt.value,
    });
    const tracer = new DebugTraceTxStreamed(
      this.#client,
      {
        structLog: (log) => structLogVisitor.visit(log),
        error: (error) => {
          if (error) {
            throw new Error(error.message);
          }
        },
      },
      { enableMemory: true, disableStack: false, disableStorage: true, enableReturnData: false },
    );

    await tracer.trace(receipt.hash);
    return structLogVisitor.finalize();
  }
}
