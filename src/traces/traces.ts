import { TxTrace } from "./tx-traces";
import { TxTracer } from "./tx-tracer";
import { DebugTxTraceStrategy } from "./debug-trace-tx-strategy";
import { HexStrPrefixed } from "../common/bytes";
import { RpcClient } from "../network";
import { DebugCallTracerStrategy } from "./debug-call-tracer-strategy";
import { getLidoContracts } from "../contracts/contracts";

export async function trace(client: RpcClient, txHash: HexStrPrefixed): Promise<TxTrace> {
  const strategy = await getTracerStrategy(client);
  const tracer = new TxTracer(strategy);
  const network = client.getNetworkName();
  return tracer.trace(network, txHash, [getLidoContracts(network).callsScript]);
}

async function getTracerStrategy(client: RpcClient) {
  const nodeInfo = await client.getNodeInfo();
  if (nodeInfo.name === "anvil") {
    return new DebugCallTracerStrategy(client);
  }
  return new DebugTxTraceStrategy(client);
}
