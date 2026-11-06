import { EthereumProvider } from "hardhat/types/providers";
import * as env from "../common/env";
import { RpcClient } from "./rpc-client";
import { createWalletClient, custom, CustomTransport, http, HttpTransport, publicActions } from "viem";
import { hardhat, hoodi, mainnet } from "viem/chains";
import { DevRpcClient } from "./dev-rpc-client";
import { KnownError } from "../common/errors";

export type NetworkName = "mainnet" | "hoodi";
type ChainId = typeof MAINNET_CHAIN_ID | typeof HOODI_CHAIN_ID;

class UnsupportedNetwork extends KnownError {
  constructor(networkName: string) {
    super(`Unsupported chain ${networkName}`);
  }
}

const HARDHAT_CHAIN_ID = 31337;
const RPC_TIMEOUT_MS = 3_000_000;
const HOODI_CHAIN_ID = 560048;
const MAINNET_CHAIN_ID = 1;

export function getChainIdByNetworkName(network: string): ChainId {
  if (network === "mainnet") return MAINNET_CHAIN_ID;
  if (network === "hoodi") return HOODI_CHAIN_ID;
  throw new UnsupportedNetwork(network);
}

export function getRpcUrl(network: NetworkName): string {
  let urls = "";
  if (network === "mainnet") {
    urls = env.ETH_MAINNET_RPC_URL();
  }
  if (network === "hoodi") {
    urls = env.ETH_HOODI_RPC_URL();
  }
  if (urls) {
    return urls.split(",")[0];
  }
  throw new UnsupportedNetwork(network);
}

export async function createRpcClient(network: NetworkName): Promise<RpcClient> {
  const transport = http(getRpcUrl(network), { timeout: RPC_TIMEOUT_MS });
  const viemClient = createPublicWalletClient(network, transport);
  assertChainId(network, await viemClient.getChainId());
  return new RpcClient(network, viemClient);
}

export async function createDevRpcClient(network: NetworkName, rpcUrl: string): Promise<DevRpcClient>;
export async function createDevRpcClient(network: NetworkName, provider: EthereumProvider): Promise<DevRpcClient>;
export async function createDevRpcClient(
  network: NetworkName,
  rpcUrlOrProvider: string | EthereumProvider,
): Promise<DevRpcClient> {
  const transport =
    typeof rpcUrlOrProvider === "string"
      ? http(rpcUrlOrProvider, { timeout: RPC_TIMEOUT_MS })
      : custom(rpcUrlOrProvider);
  const client = new DevRpcClient(network, createPublicWalletClient(network, transport));

  // node type first: callers fall back to the in-process node on any error but a KnownError
  await assertDevNode(client);
  const chainId = await client.viemClient.getChainId();
  if (chainId === HARDHAT_CHAIN_ID) {
    return new DevRpcClient(network, createWalletClient({ chain: hardhat, transport }).extend(publicActions));
  }
  assertChainId(network, chainId);
  return client;
}

export function getLocalRpcUrl(port: string | number): string {
  const portNumber = Number(port);
  if (!/^\d+$/.test(String(port)) || portNumber < 1 || portNumber > 65535) {
    throw new KnownError(`ETH_LOCAL_RPC_PORT must be a port number, got "${port}"`);
  }
  return `http://localhost:${portNumber}`;
}

// ---
// Helper Methods
// ---

const DEV_NODE_NAMES = new Set(["hardhat", "anvil"]);

function assertChainId(network: NetworkName, chainId: number) {
  const expectedChainId = getChainIdByNetworkName(network);
  if (chainId !== expectedChainId) {
    throw new KnownError(`Unexpected chain id ${chainId} of the RPC node, expected ${expectedChainId} (${network})`);
  }
}

async function assertDevNode(client: DevRpcClient) {
  const { name } = await client.getNodeInfo();
  if (!DEV_NODE_NAMES.has(name)) {
    throw new KnownError(`Refusing a "${name}" node as the dev RPC node: only hardhat and anvil are allowed`);
  }
}

function createPublicWalletClient<T extends HttpTransport | CustomTransport>(network: NetworkName, transport: T) {
  return createWalletClient({
    chain: getViemChain(network),
    transport: transport,
  }).extend(publicActions);
}

function getViemChain(network: NetworkName) {
  if (network === "mainnet") return mainnet;
  if (network === "hoodi") return hoodi;

  throw new UnsupportedNetwork(network);
}
