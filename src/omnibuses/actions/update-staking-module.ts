import { FormattedEvmCall, call, event, forward } from "../../votes";
import { OmnibusAction, OmnibusHookCtx } from "../omnibus-action";
import { BigNumberish } from "ethers";
import { StakingModule } from "../../lido/lido";
import { OmnibusActionInput, TestHelpers } from "../omnibus-action-meta";
import { Contracts } from "../../contracts/contracts";
import { assert } from "../../common/assert";
import { Test } from "mocha";

interface UpdateStakingModuleInput extends OmnibusActionInput {
  stakingModuleId: StakingModule;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

export class UpdateStakingModule extends OmnibusAction<UpdateStakingModuleInput> {
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

  async before(): Promise<void> {}

  async tests(contracts: Contracts<any>) {
    const { stakingModuleId, targetShare, treasuryFee, stakingModuleFee } = this.input;
    const summary = await contracts.stakingRouter.getStakingModule(stakingModuleId);

    return [
      new Test(`targetShare value was set to ${targetShare}`, async () => {
        assert.equal(summary.targetShare, targetShare);
      }),

      new Test(`treasureFee value was set to ${treasuryFee}`, async () => {
        assert.equal(summary.treasuryFee, treasuryFee);
      }),

      new Test(`stakingModuleFee value was set to ${stakingModuleFee}`, async () => {
        assert.equal(summary.stakingModuleFee, stakingModuleFee);
      }),
    ];
  }
}
