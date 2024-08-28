import { FormattedEvmCall, call, event, forward } from "../../votes";
import { OmnibusAction } from "../omnibus-action";
import { BigNumberish } from "ethers";
import { StakingModule } from "../../lido/lido";
import { OmnibusActionInput } from "../omnibus-action-meta";

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
}
