import { FormattedEvmCall, call, event, forward } from "../../votes";
import { OmnibusItem, OmnibusHookCtx } from "../omnibus-item";
import { BigNumberish } from "ethers";
import { StakingModule } from "../../lido/lido";
import { OmnibusActionInput } from "../omnibus-item-meta";

interface UpdateStakingModuleInput extends OmnibusActionInput {
  stakingModuleId: StakingModule;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

export class UpdateStakingModule extends OmnibusItem<UpdateStakingModuleInput> {
  get call(): FormattedEvmCall {
    const { stakingModuleId, targetShare, treasuryFee, stakingModuleFee } = this.input;
    return forward(this.contracts.agent, [
      call(this.stakingRouter.updateStakingModule, [stakingModuleId, targetShare, stakingModuleFee, treasuryFee]),
    ]);
  }
  private get stakingRouter() {
    return this.contracts.stakingRouter;
  }

  get events() {
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

  async before({}: OmnibusHookCtx): Promise<void> {}

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    const { stakingModuleId, targetShare, treasuryFee, stakingModuleFee } = this.input;
    const summary = await this.stakingRouter.getStakingModule(stakingModuleId);
    it(`targetShare value was set correctly`, async () => {
      assert.equal(summary.targetShare, targetShare);
    });
    it(`treasureFee value was set correctly`, async () => {
      assert.equal(summary.treasuryFee, treasuryFee);
    });
    it(`stakingModuleFee value was set correctly`, async () => {
      assert.equal(summary.stakingModuleFee, stakingModuleFee);
    });
  }
}
