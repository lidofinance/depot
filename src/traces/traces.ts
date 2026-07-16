import { TxTrace } from "./tx-traces";
import { TxTracer } from "./tx-tracer";
import { DebugTxTraceStrategy } from "./debug-trace-tx-strategy";
import { HexStrPrefixed } from "../common/bytes";
import { RpcClient } from "../network";
import { DebugCallTracerStrategy } from "./debug-call-tracer-strategy";
import { Contract } from "../contracts/contracts";
import { getGovernanceContracts } from "../omnibuses/governance-contracts";

export async function trace(
  client: RpcClient,
  txHash: HexStrPrefixed,
  prePopulatedContracts: Contract[] = [],
): Promise<TxTrace> {
  const strategy = await getTracerStrategy(client);
  const tracer = new TxTracer(strategy);
  const network = client.getNetworkName();
  return tracer.trace(network, txHash, [getGovernanceContracts(network).callsScript, ...prePopulatedContracts]);
}

async function getTracerStrategy(client: RpcClient) {
  const nodeInfo = await client.getNodeInfo();
  if (nodeInfo.name === "anvil") {
    return new DebugCallTracerStrategy(client);
  }
  return new DebugTxTraceStrategy(client);
}
