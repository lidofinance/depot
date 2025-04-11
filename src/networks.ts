import { Network } from "ethers";
import * as env from "./common/env";

const DEFAULT_LOCAL_ETH_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_LOCAL_ARB_RPC_URL = "http://127.0.0.1:8546";
const DEFAULT_LOCAL_OPT_RPC_URL = "http://127.0.0.1:8547";

export type ChainId = "1" | "17000";
export type ChainName = "eth" | "arb" | "opt";
export type NetworkName = "mainnet" | "holesky";

export const networkIdByName = {
  mainnet: 1,
  holesky: 17000,
};

class UnsupportedChainError extends Error {
  constructor(chainName: string) {
    super(`Unsupported chain ${chainName}`);
  }
}

const NETWORKS: Record<ChainName, Record<NetworkName, Network | null>> = {
  eth: {
    mainnet: new Network("mainnet", 1),
    holesky: new Network("holesky", 17000),
  },
  arb: {
    mainnet: new Network("arbitrum", 42161),
    holesky: null,
  },
  opt: {
    mainnet: new Network("optimism", 10),
    holesky: null,
  },
} as const;

function local(chainName: ChainName): string {
  if (chainName === "eth")
    return env.LOCAL_ETH_RPC_PORT() ? `http://127.0.0.1:${env.LOCAL_ETH_RPC_PORT()}` : DEFAULT_LOCAL_ETH_RPC_URL;
  if (chainName === "arb")
    return env.LOCAL_ARB_RPC_PORT() ? `http://127.0.0.1:${env.LOCAL_ARB_RPC_PORT()}` : DEFAULT_LOCAL_ARB_RPC_URL;
  if (chainName === "opt")
    return env.LOCAL_OPT_RPC_PORT() ? `http://127.0.0.1:${env.LOCAL_OPT_RPC_PORT()}` : DEFAULT_LOCAL_OPT_RPC_URL;
  throw new UnsupportedChainError(chainName);
}

/**
 * Returns the RPC url for the given network name
 */
function url(chainName: ChainName, networkName: NetworkName): string {
  const url = rpcUrl(chainName) || infuraUrl(chainName, networkName) || alchemyUrl(chainName, networkName);
  if (!url) {
    throw new Error(
      "RPC node credential was not provided. Please, set one of " +
        "RPC_URL, INFURA_TOKEN or ALCHEMY_TOKEN env variables",
    );
  }
  return url;
}

function rpcUrl(chainName: ChainName) {
  if (chainName === "eth") return env.ETH_RPC_URL();
  if (chainName === "arb") return env.ARB_RPC_URL();
  if (chainName === "opt") return env.OPT_RPC_URL();
}

function infuraUrl(chainName: ChainName, networkName: NetworkName) {
  const infuraToken = env.INFURA_TOKEN();
  const infuraNetworkDomain =
    chainName === "eth" && networkName === "mainnet" ? "mainnet" : `${chainName}-${networkName}`;
  return infuraToken ? `https://${infuraNetworkDomain}.infura.io/v3/${infuraToken}` : undefined;
}

function alchemyUrl(chainName: ChainName, networkName: NetworkName) {
  const alchemyToken = env.ALCHEMY_TOKEN();
  return alchemyToken ? `https://${chainName}-${networkName}.g.alchemy.com/v2/${alchemyToken}` : undefined;
}

function get(chainName: ChainName, networkName: NetworkName): Network | null {
  return NETWORKS[chainName][networkName];
}

export default {
  get,
  rpcUrl: url,
  localRpcUrl: local,
};
