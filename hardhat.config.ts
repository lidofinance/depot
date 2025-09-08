import "dotenv/config";
import { HardhatUserConfig, subtask } from "hardhat/config";

import "./src/hardhat-keystores";
import "./tasks/omnibuses";
import "hardhat-contract-sizer";
import * as env from "./src/common/env";

const glob = require("glob");
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import path from "path";
import { ContractInfoResolver } from "./src/contract-info-resolver/contract-info-resolver";
import { findContainerByName, stopContainer } from "./src/docker";

const etherscanToken = env.ETHERSCAN_TOKEN();

if (etherscanToken) {
  ContractInfoResolver.setEtherscanToken(etherscanToken);
} else {
  console.warn(`⚠️  "ETHERSCAN_TOKEN" env variable wasn't set. Some methods may work incorrectly or fail.\n`);
}
ContractInfoResolver.enableInMemoryCache();

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, hre, runSuper) => {
  const paths = await runSuper();

  const otherDirectoryGlob = path.join(hre.config.paths.root, "omnibuses", "**", "*.sol");
  const otherPaths = glob.sync(otherDirectoryGlob);

  return [...paths, ...otherPaths];
});

let isShuttingDown = false;

process.on("SIGINT", async () => {
  console.log("SIGINT");
  if (!isShuttingDown) {
    isShuttingDown = true;
    await stopDockerContainers();
  }
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM");
  if (!isShuttingDown) {
    isShuttingDown = true;
    await stopDockerContainers();
  }
});

async function stopDockerContainers() {
  const containerNames = ["lido-core", "lido-scripts", "lido-scripts-1", "lido-dual-governance", "hh-rpc-node"];
  const containers = await Promise.all(containerNames.map((name) => findContainerByName(name)));

  const stopContainerPromises: Promise<unknown>[] = [];
  for (let i = 0; i < containerNames.length; ++i) {
    const name = containerNames[i];
    const container = containers[i];
    if (container) {
      console.log(`Stopping container ${name} initiated`);
      stopContainerPromises.push(stopContainer(container, name));
    }
  }

  console.log("Waiting for containers stopped...");
  await Promise.allSettled(stopContainerPromises);
}

const config: HardhatUserConfig = {
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
  mocha: {
    timeout: 5 * 60 * 10000,
  },
  keystores: {
    path: "keystores",
  },
};

export default config;
