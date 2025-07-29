import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

import "./src/hardhat-keystores";
import "./tasks/omnibuses";

const config: HardhatUserConfig = {
  solidity: "0.8.26",
  networks: {},
  mocha: {
    timeout: 5 * 60 * 10000,
  },
  keystores: {
    path: "keystores",
  },
};

export default config;
