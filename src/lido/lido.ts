import { ContractRunner } from "ethers";

import contracts from "../contracts";
import { ChainId } from "helpers/types";
import LIDO_ON_MAINNET from "../../configs/lido-on-mainnet";
import LIDO_ON_GOERLI from "../../configs/lido-on-goerli";

export default {
  chainId(chainId: ChainId, runner?: ContractRunner) {
    if (chainId === 1n) return contracts.create(LIDO_ON_MAINNET, runner);
    if (chainId === 5n) return contracts.create(LIDO_ON_GOERLI, runner);
    throw new Error(`Unsupported chain id "${chainId}"`);
  },
  eth: {
    goerli(runner?: ContractRunner) {
      return contracts.create(LIDO_ON_GOERLI, runner);
    },
    mainnet(runner?: ContractRunner) {
      return contracts.create(LIDO_ON_MAINNET, runner);
    },
  },
};
