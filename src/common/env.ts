import "dotenv/config";

const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";

function LOCAL_RPC_URL() {
  return process.env["LOCAL_RPC_URL"] || DEFAULT_LOCAL_RPC_URL;
}

function RPC_URL() {
  return process.env["RPC_URL"];
}

function INFURA_TOKEN() {
  return process.env["INFURA_TOKEN"];
}

function ALCHEMY_TOKEN() {
  return process.env["ALCHEMY_TOKEN"];
}

function ETHERSCAN_TOKEN() {
  return process.env["ETHERSCAN_TOKEN"]
}

export default {
  RPC_URL,
  INFURA_TOKEN,
  LOCAL_RPC_URL,
  ALCHEMY_TOKEN,
  ETHERSCAN_TOKEN
};
