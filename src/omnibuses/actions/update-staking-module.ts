import { FormattedEvmCall, call, event, forward } from "../../votes";
import { BigNumberish } from "ethers";
import { StakingModule } from "../../lido/lido";
import { LidoEthContracts } from "../../lido";

interface UpdateStakingModuleInput {
  title: string;
  stakingModuleId: StakingModule;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

export const UpdateStakingModule = (contracts: LidoEthContracts<"mainnet">, input: UpdateStakingModuleInput) => {
  const { agent, callsScript, voting, stakingRouter } = contracts;
  const { stakingModuleId, targetShare, stakingModuleFee, treasuryFee } = input;

  return {
    title: `Update ${StakingModule[input.stakingModuleId]} staking module`,
    getEVMCalls(): FormattedEvmCall[] {
      return [
        forward(agent, [
          call(stakingRouter.updateStakingModule, [stakingModuleId, targetShare, stakingModuleFee, treasuryFee]),
        ]),
      ];
    },
    getExpectedEvents() {
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
    },
  };
};
