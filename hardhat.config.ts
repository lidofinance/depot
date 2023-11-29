import path from "path";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";

import "./tasks/omnibuses";
import "./src/hardhat-keystore";

import rpcs from "./src/rpcs";
import traces from "./src/traces";
import env from "./src/common/env";
import networks from "./src/networks";
import contracts from "./src/contracts";

traces.hardhat.setup();
rpcs.setLogsDir(path.join(__dirname, "rpc-node-logs"));

const etherscanToken = env.ETHERSCAN_TOKEN();
if (etherscanToken) {
  contracts.setup.etherscanToken(etherscanToken);
  contracts.setup.jsonCachePath(path.join(__dirname, "etherscan-cache"));
}

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: networks.rpcUrl("eth", "mainnet"),
      },
    },
  },
  typechain: {
    externalArtifacts: ["interfaces/*.json"],
  },
  mocha: {
    timeout: 5 * 60 * 1000,
  },
  keystore: {
    path: "keystores",
  },
};

export default config;
