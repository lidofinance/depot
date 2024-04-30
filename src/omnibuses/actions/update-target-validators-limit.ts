import { FormattedEvmCall, call, event, forward } from "../../votes";
import { OmnibusItem, OmnibusHookCtx } from "../omnibus-item";

interface UpdateTargetValidatorsLimitInput {
  stakingModuleId: number;
  nodeOperator: { name: string; id: number };
  targetValidatorsCount: number;
  isTargetLimitActive: boolean;
}

export class UpdateTargetValidatorsLimit extends OmnibusItem<UpdateTargetValidatorsLimitInput> {
  get title(): string {
    const { isTargetLimitActive, nodeOperator, targetValidatorsCount: targetLimit } = this.input;
    const action = isTargetLimitActive ? "Activate" : "Deactivate";
    return `${action} targetValidatorsLimit for operator "${nodeOperator.name}" (id: ${nodeOperator.id}) and set it to ${targetLimit}`;
  }

  get call(): FormattedEvmCall {
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
  private get stakingRouter() {
    return this.contracts.stakingRouter;
  }

  private get curatedStakingModule() {
    return this.contracts.curatedStakingModule;
  }

  get events() {
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
      assert.isTrue(
        summary.isTargetLimitActive !== isTargetLimitActive ||
          summary.targetValidatorsCount.toString() !== targetLimit.toString(),
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
