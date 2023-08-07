import "dotenv/config";
import { HardhatUserConfig, extendEnvironment, extendProvider } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "./tasks";

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
      chainId: 1,
    },
  },
  typechain: {
    externalArtifacts: ["interfaces/*.json"],
  },
};

export default config;
