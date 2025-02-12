import "dotenv/config";

export const LOCAL_ETH_RPC_URL = () => process.env.LOCAL_ETH_RPC_URL;
export const LOCAL_ARB_RPC_URL = () => process.env.LOCAL_ARB_RPC_URL;

export const LOCAL_OPT_RPC_URL = () => process.env.LOCAL_OPT_RPC_URL;

export const ETH_RPC_URL = () => process.env.ETH_RPC_URL;

export const ARB_RPC_URL = () => process.env.ARB_RPC_URL;

export const OPT_RPC_URL = () => process.env.OPT_RPC_URL;

export const INFURA_TOKEN = () => process.env.INFURA_TOKEN;

export const ALCHEMY_TOKEN = () => process.env.ALCHEMY_TOKEN;

export const ETHERSCAN_TOKEN = () => process.env.ETHERSCAN_TOKEN;

export const PINATA_JWT = () => process.env.PINATA_JWT;

export const CLEAN_FORK_PORT = () => process.env.CLEAN_FORK_PORT || "8546";

export const DIRTY_FORK_PORT = () => process.env.DIRTY_FORK_PORT || "8545";

export const GITHUB_ORG = () => process.env.GITHUB_ORG || "lidofinance";

export const GIT_BRANCH_SCRIPTS = () => process.env.GIT_BRANCH_SCRIPTS || "master";

export const GIT_BRANCH_CORE = () => process.env.GIT_BRANCH_CORE || "master";

export const HH_NODE_IMAGE = () => process.env.HH_NODE_IMAGE || "ghcr.io/lidofinance/hardhat-node:2.22.16";

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
