import "dotenv/config";

import { KnownError } from "./errors";
import type { NetworkName } from "../network/network";

export const ETH_LOCAL_RPC_PORT = () => getOptionalEnvVar("ETH_LOCAL_RPC_PORT", "8545");
// A native Linux engine reaches host.docker.internal through the bridge gateway, so CI binds 0.0.0.0
export const ETH_LOCAL_RPC_BIND_IP = () => getOptionalEnvVar("ETH_LOCAL_RPC_BIND_IP", "127.0.0.1");

export const ETH_MAINNET_RPC_URL = () => getRequiredEnvVar("ETH_MAINNET_RPC_URL");
export const ETH_HOODI_RPC_URL = () => getRequiredEnvVar("ETH_HOODI_RPC_URL");

export const ETHERSCAN_TOKEN = () => process.env.ETHERSCAN_TOKEN;

export const PINATA_JWT = () => process.env.PINATA_JWT;

export const GITHUB_ORG = () => process.env.GITHUB_ORG || "lidofinance";

export const GIT_BRANCH_SCRIPTS = () => process.env.GIT_BRANCH_SCRIPTS || "master";
export const GIT_BRANCH_DG = () => process.env.GIT_BRANCH_DG || "develop";
export const GIT_BRANCH_CORE = () => process.env.GIT_BRANCH_CORE || "master";
export const GIT_BRANCH_STAKING_MODULES = () => process.env.GIT_BRANCH_STAKING_MODULES || "develop";
export const GIT_BRANCH_STONKS = () => process.env.GIT_BRANCH_STONKS || "main";

export const GIT_SHA_SCRIPTS = () => process.env.GIT_SHA_SCRIPTS || "";
// DG regressions are pinned to the merge of DG #369 (SR3-compatible regression helpers)
export const GIT_SHA_DG = () => process.env.GIT_SHA_DG || "cc407b472199585b21d33b14c6b3067a6b62de96";
export const GIT_SHA_CORE = () => process.env.GIT_SHA_CORE || "";
export const GIT_SHA_STAKING_MODULES = () => process.env.GIT_SHA_STAKING_MODULES || "";
export const GIT_SHA_STONKS = () => process.env.GIT_SHA_STONKS || "";

export const HH_NODE_IMAGE = (network: NetworkName) =>
  `ghcr.io/lidofinance/hardhat-node:2.28.0${network === "hoodi" ? "-hoodi" : ""}`;
export const SCRIPTS_IMAGE = () =>
  process.env.SCRIPTS_IMAGE ||
  "ghcr.io/lidofinance/scripts:v22@sha256:a091e1a7997ab51fe2d88a8336ec9baf60d79a8da5bf30cdbc264e6a85129c8b";
/** e.g. `linux/amd64`; empty = host architecture */
export const IMAGE_PLATFORM = (repo: string) =>
  process.env[`IMAGE_PLATFORM_${repo.toUpperCase().replace(/-/g, "_")}`] || "";

function getRequiredEnvVar(name: string) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new KnownError(`required ENV variable "${name}" is not set`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string;
function getOptionalEnvVar(name: string): string | undefined;
function getOptionalEnvVar(name: string, defaultValue?: string) {
  return process.env[name] ?? defaultValue;
}
