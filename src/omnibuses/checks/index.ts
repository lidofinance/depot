import { Contracts } from "../../contracts/contracts";
import { BigNumberish } from "ethers";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";
import { checkLDOBalance } from "./balance";
import { checkNodeOperator, checkNodeOperatorsCount } from "./node-operators";
import { checkStakingModule, StakingModuleParams } from "./staking-router";

export interface Checks {
  StakingRouter: StakingRouterChecks;
  Balance: BalanceChecks;
}

interface BalanceChecks {
  checkLDOBalance(address: string, balance: BigNumberish): void;
}

interface StakingRouterChecks {
  checkNodeOperator(nopID: bigint, name: string, rewardAddress: `0x${string}`): void;
  checkNodeOperatorsCount(expectedCount: BigNumberish): void;
  checkStakingModule(stakingModuleID: BigNumberish, expectedParams: StakingModuleParams): void;
}

export const checks = (contracts: Contracts<typeof LidoOnMainnet>): Checks => {
  return {
    Balance: {
      checkLDOBalance: checkLDOBalance(contracts),
    },
    StakingRouter: {
      checkNodeOperator: checkNodeOperator(contracts),
      checkNodeOperatorsCount: checkNodeOperatorsCount(contracts),
      checkStakingModule: checkStakingModule(contracts),
    },
  };
};
