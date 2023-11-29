import { call, event, forward } from "../../votes";
import {
  OmnibusAction,
  OmnibusBeforeContext,
  OmnibusTestContext,
  TitledEventChecks,
  TitledEvmCall,
} from "../omnibus";

interface UpdateTargetValidatorsLimitInput {
  stakingModuleId: number;
  nodeOperator: { name: string; id: number };
  targetValidatorsCount: number;
  isTargetLimitActive: boolean;
}

export class UpdateTargetValidatorsLimit extends OmnibusAction<UpdateTargetValidatorsLimitInput> {
  private get stakingRouter() {
    return this.contracts.stakingRouter;
  }

  private get curatedStakingModule() {
    return this.contracts.curatedStakingModule;
  }

  calls(): TitledEvmCall[] {
    const {
      stakingModuleId,
      nodeOperator,
      isTargetLimitActive,
      targetValidatorsCount: targetLimit,
    } = this.input;
    const action = isTargetLimitActive ? "Activate" : "Deactivate";
    return [
      [
        `${action} targetValidatorsLimit for operator "${nodeOperator.name}" (id: ${nodeOperator.id}) and set it to ${targetLimit}`,
        forward(this.contracts.agent, [
          call(this.stakingRouter.updateTargetValidatorsLimits, [
            stakingModuleId,
            nodeOperator.id,
            isTargetLimitActive,
            targetLimit,
          ]),
        ]),
      ],
    ];
  }
  events(): TitledEventChecks[] {
    const { agent, callsScript, curatedStakingModule, voting } = this.contracts;
    return [
      [
        `Update target validator limit for node operator ${this.input.nodeOperator.name} (id=${this.input.nodeOperator.id})`,
        event(callsScript, "LogScriptCall", { emitter: voting }),
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(curatedStakingModule, "TargetValidatorsCountChanged", {
          args: [this.input.nodeOperator.id, this.input.targetValidatorsCount],
        }),
        event(curatedStakingModule, "KeysOpIndexSet"),
        event(curatedStakingModule, "NonceChanged"),
      ],
      ["Aragon forward result", event(agent, "ScriptResult")],
    ];
  }

  async before({ assert }: OmnibusBeforeContext): Promise<void> {
    const {
      stakingModuleId,
      nodeOperator: { name, id },
      isTargetLimitActive,
      targetValidatorsCount: targetLimit,
    } = this.input;
    const [operator, summary] = await Promise.all([
      this.curatedStakingModule.getNodeOperator(id, true),
      this.stakingRouter.getNodeOperatorSummary(stakingModuleId, id),
    ]);
    assert.equal(name, operator.name, "Invalid node operator name");
    assert.isTrue(
      summary.isTargetLimitActive !== isTargetLimitActive ||
        summary.targetValidatorsCount.toString() !== targetLimit.toString(),
      "isTargetLimitActive and targetLimit values are the same",
    );
  }

  async test({ it, assert }: OmnibusTestContext): Promise<void> {
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
