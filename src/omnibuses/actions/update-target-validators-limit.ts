import { FormattedEvmCall, call, event, forward } from "../../votes";
import { OmnibusAction, OmnibusHookCtx } from "../omnibus-action";
import { OmnibusActionInput } from "../omnibus-action-meta";

interface UpdateTargetValidatorsLimitInput extends OmnibusActionInput {
  stakingModuleId: number;
  nodeOperator: { name: string; id: number };
  targetValidatorsCount: number;
  isTargetLimitActive: boolean;
}

export class UpdateTargetValidatorsLimit extends OmnibusAction<UpdateTargetValidatorsLimitInput> {
  get title(): string {
    return this.input.title;
  }

  private get stakingRouter() {
    return this.contracts.stakingRouter;
  }

  private get curatedStakingModule() {
    return this.contracts.curatedStakingModule;
  }

  getEVMCall(): FormattedEvmCall {
    const { stakingModuleId, nodeOperator, isTargetLimitActive, targetValidatorsCount: targetLimit } = this.input;
    return forward(this.contracts.agent, [
      call(this.stakingRouter.updateTargetValidatorsLimits, [
        stakingModuleId,
        nodeOperator.id,
        isTargetLimitActive,
        targetLimit,
      ]),
    ]);
  }

  getExpectedEvents() {
    const { agent, callsScript, curatedStakingModule, voting } = this.contracts;
    return [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(curatedStakingModule, "TargetValidatorsCountChanged", {
        args: [this.input.nodeOperator.id, this.input.targetValidatorsCount],
      }),
      event(curatedStakingModule, "KeysOpIndexSet"),
      event(curatedStakingModule, "NonceChanged"),
      event(agent, "ScriptResult"),
    ];
  }

  async before({ it, assert }: OmnibusHookCtx): Promise<void> {
    const {
      stakingModuleId,
      nodeOperator: { name, id },
      isTargetLimitActive,
      targetValidatorsCount: targetLimit,
    } = this.input;

    it("Validate operator name is correct before assignment", async () => {
      const operator = await this.curatedStakingModule.getNodeOperator(id, true);
      assert.equal(name, operator.name, "Invalid node operator name");
    });

    it("Validate isTargetLimitActive and targetLimit values are not the same as new one", async () => {
      const summary = await this.stakingRouter.getNodeOperatorSummary(stakingModuleId, id);
      assert.equal(
        summary.isTargetLimitActive !== isTargetLimitActive ||
          summary.targetValidatorsCount.toString() !== targetLimit.toString(),
        true,
        "isTargetLimitActive and targetLimit values are the same",
      );
    });
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    const {
      stakingModuleId,
      nodeOperator: { id },
      isTargetLimitActive,
      targetValidatorsCount,
    } = this.input;
    const summary = await this.stakingRouter.getNodeOperatorSummary(stakingModuleId, id);
    it(`isTargetLimitActive value was set correctly`, async () => {
      assert.equal(summary.isTargetLimitActive, isTargetLimitActive);
    });
    it(`targetValidatorsCount value was set correctly`, async () => {
      assert.equal(summary.targetValidatorsCount.toString(), targetValidatorsCount.toString());
    });
  }
}
