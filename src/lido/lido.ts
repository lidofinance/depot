import { ContractRunner } from "ethers";

import contracts from "../contracts";
import { ChainId } from "../common/types";
import LIDO_ON_MAINNET from "../../configs/lido-on-mainnet";
import LIDO_ON_HOLESKY from "../../configs/lido-on-holesky";

export default {
  chainId(chainId: ChainId, runner?: ContractRunner) {
    if (Number(chainId) === 1) return contracts.create(LIDO_ON_MAINNET, runner);
    if (Number(chainId) === 17000) return contracts.create(LIDO_ON_HOLESKY, runner);
    throw new Error(`Unsupported chain id "${chainId}"`);
  },
  eth: {
    holesky(runner?: ContractRunner) {
      return contracts.create(LIDO_ON_HOLESKY, runner);
    },
    mainnet(runner?: ContractRunner) {
      return contracts.create(LIDO_ON_MAINNET, runner);
    },
  },
};

export enum StakingModule {
  CuratedStakingModule = 1,
  SimpleDVT = 2,
}
