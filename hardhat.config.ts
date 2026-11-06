import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

import * as env from "./src/common/env";
import { omnibusTaskBuilders } from "./tasks/omnibuses";
import { keystoreTaskBuilders } from "./tasks/keystores";
import { abiTaskBuilders } from "./tasks/abi";

import { ContractInfoResolver } from "./src/contract-info-resolver/contract-info-resolver";
import { withCliErrorBoundary } from "./src/hardhat/task-errors";

const etherscanToken = env.ETHERSCAN_TOKEN();

if (etherscanToken) {
  ContractInfoResolver.setEtherscanToken(etherscanToken);
} else {
  console.warn(`⚠️  "ETHERSCAN_TOKEN" env variable wasn't set. Some methods may work incorrectly or fail.\n`);
}

const config: HardhatUserConfig = {
  tasks: [...omnibusTaskBuilders, ...keystoreTaskBuilders, ...abiTaskBuilders].map((taskBuilder) =>
    withCliErrorBoundary(taskBuilder.build()),
  ),
  paths: {
    sources: {
      solidity: ["contracts", "omnibuses"],
    },
  },
  solidity: {
    version: "0.8.26",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        details: {
          yulDetails: {
            optimizerSteps: "u",
          },
        },
      },
    },
  },
  networks: {},
};

export default config;
