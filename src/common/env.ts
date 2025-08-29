import "dotenv/config";

export const LOCAL_ETH_RPC_PORT = () => process.env.LOCAL_ETH_RPC_PORT || "8545";
export const LOCAL_ARB_RPC_PORT = () => process.env.LOCAL_ARB_RPC_PORT || "8546";
export const LOCAL_OPT_RPC_PORT = () => process.env.LOCAL_OPT_RPC_PORT || "8547";

export const ETH_MAINNET_RPC_URL = () => getRequiredEnvVar("ETH_MAINNET_RPC_URL");
export const ETH_HOLESKY_RPC_URL = () => getRequiredEnvVar("ETH_HOLESKY_RPC_URL");
export const ETH_HOODI_RPC_URL = () => getRequiredEnvVar("ETH_HOODI_RPC_URL");

export const ARB_RPC_URL = () => process.env.ARB_RPC_URL;
export const OPT_RPC_URL = () => process.env.OPT_RPC_URL;

export const ETHERSCAN_TOKEN = () => process.env.ETHERSCAN_TOKEN;

export const PINATA_JWT = () => process.env.PINATA_JWT;

export const GITHUB_ORG = () => process.env.GITHUB_ORG || "lidofinance";

export const GIT_BRANCH_SCRIPTS = () => process.env.GIT_BRANCH_SCRIPTS || "master";
export const GIT_BRANCH_DG = () => process.env.GIT_BRANCH_DG || "main";
export const GIT_BRANCH_CORE = () => process.env.GIT_BRANCH_CORE || "master";

export const GIT_SHA_SCRIPTS = () => process.env.GIT_SHA_SCRIPTS || '';
export const GIT_SHA_DG = () => process.env.GIT_SHA_DG || '';
export const GIT_SHA_CORE = () => process.env.GIT_SHA_CORE || '';

export const HH_NODE_IMAGE = () => process.env.HH_NODE_IMAGE || "ghcr.io/lidofinance/hardhat-node:2.26.0";

export function ETHERSCAN_CACHE_ENABLED() {
  switch (process.env.ETHERSCAN_CACHE_ENABLED) {
    case "true":
    case "1":
    case "yes":
      return true;
    default:
      return false;
  }
}

/** Check that require retirement variable was filled */
export function checkEnvVars() {
  if (!ETHERSCAN_TOKEN()) {
    console.warn(
      "ETHERSCAN_TOKEN is not set, therefore parsed trace calls will not include contract names. If you want to see the detailed information about calls, please set the ETHERSCAN_TOKEN environment variable.",
    );
  }
}

export function getRequiredEnvVar(name: string) {
  const value = process.env[name];
  if (value === undefined || value === null) {
    throw new Error(`required ENV variable "${name}" is not set`);
  }
  return value;
}

export function getOptionalEnvVar(name: string, defaultValue?: any) {
  return process.env[name] ?? defaultValue;
}
