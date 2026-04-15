import { assert } from "chai";
import { getLidoContracts } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { event } from "../omnibus";
import stakingRouter, { StakingModule } from "./staking-router";

function createCtx() {
  const contracts = getLidoContracts("mainnet");
  return {
    contracts,
    event,
    directCall: OmnibusDirectCall.createCallBuilder({ voting: contracts.voting, callsScript: contracts.callsScript }),
  } as any;
}

describe("staking-router blueprint", () => {
  it("updateStakingModule creates expected call and events", () => {
    const ctx = createCtx();
    const call = stakingRouter.updateStakingModule(ctx, {
      title: "Update simple DVT module params",
      stakingModuleId: BigInt(StakingModule.SimpleDVT),
      stakeShareLimit: 40_000n,
      priorityExitShareThreshold: 10_000n,
      stakingModuleFee: 500n,
      treasuryFee: 500n,
      maxDepositsPerBlock: 150n,
      minDepositBlockDistance: 25n,
    });

    assert.equal(call.title, "Update simple DVT module params");
    assert.equal(call.functionName, "updateStakingModule");
    assert.deepEqual(call.args, [2n, 40000n, 10000n, 500n, 500n, 150n, 25n]);

    const proposalEvents = call.getEventsFor("proposal");
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
