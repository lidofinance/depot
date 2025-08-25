import { EthereumProvider } from "hardhat/types";
import * as env from "../common/env";
import { RpcClient } from "./rpc-client";
import { createWalletClient, custom, CustomTransport, http, HttpTransport, publicActions } from "viem";
import { holesky, mainnet } from "viem/chains";
import { DevRpcClient } from "./dev-rpc-client";

export type NetworkName = "mainnet" | "holesky";
export type ChainId = typeof MAINNET_CHAIN_ID | typeof HOLESKY_CHAIN_ID;

class UnsupportedNetwork extends Error {
  constructor(networkName: string) {
    super(`Unsupported chain ${networkName}`);
  }
}

class UnsupportedChainId extends Error {
  constructor(chainId: number) {
    super(`Unsupported chain ${chainId}`);
  }
}

const HARDHAT_CHAIN_ID = 31337;
export const MAINNET_CHAIN_ID = 1;
export const HOLESKY_CHAIN_ID = 17000;
// export const HOODI_CHAIN_ID = 560048;

export function getChainIdByNetworkName(network: string): ChainId {
  if (network === "mainnet") return MAINNET_CHAIN_ID;
  if (network === "holesky") return HOLESKY_CHAIN_ID;
  throw new UnsupportedNetwork(network);
}

export function getNetworkNameByChainId(chainId: number): NetworkName {
  if (chainId === MAINNET_CHAIN_ID) {
    return "mainnet";
  }
  if (chainId === HOLESKY_CHAIN_ID) {
    return "holesky";
  }
  throw new UnsupportedChainId(chainId);
}

export function getRpcUrl(network: NetworkName, ind = 0): string {
  let urls = "";
  if (network === "mainnet") {
    urls = env.ETH_MAINNET_RPC_URL();
  }
  if (network === "holesky") {
    urls = env.ETH_HOLESKY_RPC_URL();
  }
  if (urls) {
    return urls.split(",")[ind % urls.split(",").length]; // always in range
  }
  throw new UnsupportedNetwork(network);
}

export async function createRpcClient(network: NetworkName, rpcUrl?: string): Promise<RpcClient>;
export async function createRpcClient(network: NetworkName, provider: EthereumProvider): Promise<RpcClient>;
export async function createRpcClient(
  network: NetworkName,
  rpcUrlOrProvider: string | undefined | EthereumProvider,
): Promise<RpcClient> {
  const viemClient =
    typeof rpcUrlOrProvider === "string" || rpcUrlOrProvider === undefined
      ? await createPublicWalletClientFromNetwork(network, rpcUrlOrProvider ?? getRpcUrl(network))
      : await createPublicWalletClientFromProvider(network, rpcUrlOrProvider);

  return new RpcClient(network, viemClient);
}

export async function createDevRpcClient(network: NetworkName, rpcUrl?: string): Promise<DevRpcClient>;
export async function createDevRpcClient(network: NetworkName, provider: EthereumProvider): Promise<DevRpcClient>;
export async function createDevRpcClient(
  network: NetworkName,
  rpcUrlOrProvider: string | undefined | EthereumProvider,
): Promise<DevRpcClient> {
  const viemClient =
    typeof rpcUrlOrProvider === "string" || rpcUrlOrProvider === undefined
      ? await createPublicWalletClientFromNetwork(network, rpcUrlOrProvider ?? getRpcUrl(network))
      : await createPublicWalletClientFromProvider(network, rpcUrlOrProvider);

  return new DevRpcClient(network, viemClient);
}

export default {
  MAINNET_CHAIN_ID,
  HOLESKY_CHAIN_ID,
  getRpcUrl,
  createRpcClient,
  createDevRpcClient,
  getChainIdByNetworkName,
  getNetworkNameByChainId,
};

// ---
// Helper Methods
// ---

async function createPublicWalletClientFromNetwork(network: NetworkName, rpcUrl: string) {
  const viemClient = createPublicWalletClient(network, http(rpcUrl, { timeout: 300_0000 }));
  const chainId = await viemClient.getChainId();

  if (chainId !== getChainIdByNetworkName(network)) {
    throw new Error(`Unexpected chain id`);
  }

  return viemClient;
}

async function createPublicWalletClientFromProvider(network: NetworkName, provider: EthereumProvider) {
  const viemClient = createPublicWalletClient(network, custom(provider));

  const chainId = await viemClient.getChainId();

  // Default hh network has chain id 1337
  if (chainId === HARDHAT_CHAIN_ID || chainId === getChainIdByNetworkName(network)) {
    return viemClient;
  }

  throw new Error(`Unexpected chain id`);
}

function createPublicWalletClient<T extends HttpTransport | CustomTransport>(network: NetworkName, transport: T) {
  return createWalletClient({
    chain: getViemChain(network),
    transport: transport,
  }).extend(publicActions);
}

function getViemChain(network: NetworkName) {
  if (network === "mainnet") {
    return mainnet;
  }
  if (network === "holesky") {
    return holesky;
  }
  throw new UnsupportedNetwork(network);
}
