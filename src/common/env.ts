import "dotenv/config";

function LOCAL_ETH_RPC_URL() {
  return process.env.LOCAL_ETH_RPC_URL;
}
function LOCAL_ARB_RPC_URL() {
  return process.env.LOCAL_ARB_RPC_URL;
}
function LOCAL_OPT_RPC_URL() {
  return process.env.LOCAL_OPT_RPC_URL;
}

function ETH_RPC_URL() {
  return process.env.ETH_RPC_URL;
}

function ARB_RPC_URL() {
  return process.env.ARB_RPC_URL;
}

function OPT_RPC_URL() {
  return process.env.OPT_RPC_URL;
}

function INFURA_TOKEN() {
  return process.env.INFURA_TOKEN;
}

function ALCHEMY_TOKEN() {
  return process.env.ALCHEMY_TOKEN;
}

function ETHERSCAN_TOKEN() {
  return process.env.ETHERSCAN_TOKEN;
}

function PINATA_JWT() {
  return process.env.PINATA_JWT;
}

function CLEAN_FORK_PORT() {
  return process.env.CLEAN_FORK_PORT || "8546";
}

function DIRTY_FORK_PORT() {
  return process.env.DIRTY_FORK_PORT || "8545";
}

function GITHUB_ORG() {
  return process.env.GITHUB_ORG || "lidofinance";
}
function GIT_BRANCH_SCRIPTS() {
  return process.env.GIT_BRANCH_SCRIPTS || "master";
}
function GIT_BRANCH_CORE() {
  return process.env.GIT_BRANCH_CORE || "master";
}

function HH_NODE_IMAGE() {
  return process.env.HH_NODE_IMAGE || 'ghcr.io/lidofinance/hardhat-node:2.22.16';
}

function ETHERSCAN_CACHE_ENABLED() {
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
function checkEnvVars() {
  if (!ETHERSCAN_TOKEN()) {
    console.warn(
      "ETHERSCAN_TOKEN is not set, therefore parsed trace calls will not include contract names. If you want to see the detailed information about calls, please set the ETHERSCAN_TOKEN environment variable.",
    );
  }
}

export default {
  ETH_RPC_URL,
  ARB_RPC_URL,
  OPT_RPC_URL,
  INFURA_TOKEN,
  LOCAL_ETH_RPC_URL,
  LOCAL_ARB_RPC_URL,
  LOCAL_OPT_RPC_URL,
  DIRTY_FORK_PORT,
  CLEAN_FORK_PORT,
  ALCHEMY_TOKEN,
  ETHERSCAN_TOKEN,
  ETHERSCAN_CACHE_ENABLED,
  checkEnvVars,
  PINATA_JWT,
  GITHUB_ORG,
  HH_NODE_IMAGE,
  GIT_BRANCH_CORE,
  GIT_BRANCH_SCRIPTS,
};
