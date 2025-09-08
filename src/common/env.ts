import "dotenv/config";

export const ETH_LOCAL_RPC_PORT = () => getOptionalEnvVar("ETH_LOCAL_RPC_URL", "8545");

export const ETH_MAINNET_RPC_URL = () => getRequiredEnvVar("ETH_MAINNET_RPC_URL");
export const ETH_HOLESKY_RPC_URL = () => getRequiredEnvVar("ETH_HOLESKY_RPC_URL");
export const ETH_HOODI_RPC_URL = () => getRequiredEnvVar("ETH_HOODI_RPC_URL");

export const ETHERSCAN_TOKEN = () => process.env.ETHERSCAN_TOKEN;

export const PINATA_JWT = () => process.env.PINATA_JWT;

export const GITHUB_ORG = () => process.env.GITHUB_ORG || "lidofinance";
export const GIT_BRANCH_SCRIPTS = () => process.env.GIT_BRANCH_SCRIPTS || "master";
export const GIT_BRANCH_DG = () => process.env.GIT_BRANCH_DG || "main";
export const GIT_BRANCH_CORE = () => process.env.GIT_BRANCH_CORE || "master";

export const HH_NODE_IMAGE = () => process.env.HH_NODE_IMAGE || "ghcr.io/lidofinance/hardhat-node:2.26.0";

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
