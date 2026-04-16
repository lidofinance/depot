import { assert } from "chai";
import { contract } from "../../../src/contracts";
import { getGovernanceContracts } from "../../../src/omnibuses/governance-contracts";
import { OmnibusDirectCallFactory } from "../../../src/omnibuses/calls/omnibus-direct-call";
import { event, BlueprintCtx } from "../../../src/omnibuses/omnibus";
import { StakingRouter_ABI } from "../../../abi/StakingRouter.abi";
import stakingRouter, { StakingModule } from "../../../src/omnibuses/blueprints/staking-router";

function createCtx(): BlueprintCtx {
  const { voting, callsScript } = getGovernanceContracts("mainnet");
  const factory = new OmnibusDirectCallFactory(voting, callsScript);
  return {
    event,
    directCall: factory.create.bind(factory),
  };
}

const stakingRouterContract = contract(StakingRouter_ABI, "0xFdDf38947aFB03C621C71b06C9C70bce73f12999");

describe("staking-router blueprint", () => {
  it("updateStakingModule creates expected call and events", () => {
    const ctx = createCtx();
    const call = stakingRouter.updateStakingModule(
      ctx,
      { stakingRouter: stakingRouterContract },
      {
        title: "Update simple DVT module params",
        stakingModuleId: BigInt(StakingModule.SimpleDVT),
        stakeShareLimit: 40_000n,
        priorityExitShareThreshold: 10_000n,
        stakingModuleFee: 500n,
        treasuryFee: 500n,
        maxDepositsPerBlock: 150n,
        minDepositBlockDistance: 25n,
      },
    );

    assert.equal(call.title, "Update simple DVT module params");
    assert.equal(call.input.fn, "updateStakingModule");
    assert.deepEqual(call.input.args, [2n, 40000n, 10000n, 500n, 500n, 150n, 25n]);

    const proposalEvents = call.getExpectedEvents("proposal");
    assert.deepEqual(
      proposalEvents.map((e) => e.abi.name),
      [
        "StakingModuleShareLimitSet",
        "StakingModuleFeesSet",
        "StakingModuleMaxDepositsPerBlockSet",
        "StakingModuleMinDepositBlockDistanceSet",
      ],
    );

    const shareLimitEvent = proposalEvents[0];
    assert.deepEqual(shareLimitEvent.args, [2n, 40_000n, 10_000n, null]);

    const feesEvent = proposalEvents[1];
    assert.deepEqual(feesEvent.args, [2n, 500n, 500n, null]);

    const maxDepositsEvent = proposalEvents[2];
    assert.deepEqual(maxDepositsEvent.args, [2n, 150n, null]);

    const minDistanceEvent = proposalEvents[3];
    assert.deepEqual(minDistanceEvent.args, [2n, 25n, null]);
  });
});
