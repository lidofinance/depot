import { FormattedEvmCall, call, event, forward } from "../../../votes";
import { OmnibusAction } from "../../omnibus-action";
import { BigNumberish } from "ethers";
import { StakingModule } from "../../../lido/lido";
import { OmnibusActionInput } from "../../omnibus-action-meta";
import { ActionTestContext } from "../../../testing/contracts";

interface UpdateStakingModuleInput extends OmnibusActionInput {
  stakingModuleId: StakingModule;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

class UpdateStakingModuleClass extends OmnibusAction<UpdateStakingModuleInput> {
  private get stakingRouter() {
    return this.contracts.stakingRouter;
  }

  getEVMCalls(): FormattedEvmCall[] {
    const { stakingModuleId, targetShare, treasuryFee, stakingModuleFee } = this.input;
    return [
      forward(this.contracts.agent, [
        call(this.stakingRouter.updateStakingModule, [stakingModuleId, targetShare, stakingModuleFee, treasuryFee]),
      ]),
    ];
  }

  getExpectedEvents() {
    const { agent, callsScript, voting, stakingRouter } = this.contracts;
    const { stakingModuleId, targetShare, stakingModuleFee, treasuryFee } = this.input;

    return [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stakingRouter, "StakingModuleTargetShareSet", {
        args: [stakingModuleId, targetShare, agent],
      }),
      event(stakingRouter, "StakingModuleFeesSet", {
        args: [stakingModuleId, stakingModuleFee, treasuryFee, agent],
      }),
      event(agent, "ScriptResult"),
    ];
  }

  async getTestContext(): Promise<ActionTestContext> {
    return {
      imports: ['import { StakingModule } from "../src/lido/lido";'],
      globalValues: {
        expectedTargetShare: `${this.input.targetShare}n`,
        expectedTreasuryFee: `${this.input.treasuryFee}n`,
        expectedStakingModuleFee: `${this.input.stakingModuleFee}n`,
      },
      beforeChecks: [beforeCheck],
      testSuites: [testSuite],
    };
  }
}

export const UpdateStakingModule = (input: UpdateStakingModuleInput) => new UpdateStakingModuleClass(input);

const beforeCheck = `
it("Simple DVT module target share is --PERCENTAGE HERE--%", async () => {
  const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

  assert.equal(stakingModule.targetShare, "--VALUE HERE--");
});
`;
const testSuite = `
describe("UpdateStakingModule", () => {
  it("Simple DVT module was correctly updated", async () => {
    const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

    assert.equal(stakingModule.targetShare, expectedTargetShare);
    assert.equal(stakingModule.treasuryFee, expectedTreasuryFee);
    assert.equal(stakingModule.stakingModuleFee, expectedStakingModuleFee);
  });
});
`;
