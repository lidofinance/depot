import type { Context } from "mocha";
import { createDevRpcClient, DevRpcClient } from "@/src/network";

export type AcceptanceNetwork = "mainnet" | "hoodi";

type AcceptanceContext = Context & { client?: DevRpcClient };

export function getAcceptanceNetwork(context: AcceptanceContext): AcceptanceNetwork {
  const network = context.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
  if (network !== "mainnet" && network !== "hoodi") {
    throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
  }
  return network;
}

export async function connectAcceptanceClient(
  context: AcceptanceContext,
  network: AcceptanceNetwork,
): Promise<DevRpcClient> {
  return context.client ?? createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545");
}
