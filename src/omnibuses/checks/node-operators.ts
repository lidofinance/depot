import { BigNumberish } from "ethers";
import { assert } from "../../common/assert";
import { Contracts } from "../../contracts/contracts";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";

export const checkNodeOperator =
  (contracts: Contracts<typeof LidoOnMainnet>) =>
  async (nopID: BigNumberish, name: string, rewardAddress: `0x${string}`) => {
    const nopInfo = await contracts.curatedStakingModule.getNodeOperator(nopID, false);

    assert.equal(nopInfo.rewardAddress, rewardAddress, `Operator ${name} not found`);
  };

export const checkNodeOperatorsCount =
  (contracts: Contracts<typeof LidoOnMainnet>) => async (expectedCount: BigNumberish) => {
    const nodeOperatorsCount = await contracts.curatedStakingModule.getNodeOperatorsCount();

    assert.equal(nodeOperatorsCount, expectedCount);
  };
