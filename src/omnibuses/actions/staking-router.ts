import { BigNumberish } from "ethers";
import lido, { StakingModule } from "../../lido/lido";
import { NetworkName } from "../../networks";
import { call, event, forward } from "../../votes";
import { OmnibusAction } from "../omnibus-action";

type StakingModuleName = "Curated" | "SDVT";

interface UpdateStakingModuleInput {
  title: string;
  stakingModule: StakingModuleName;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

function getStakingModuleId(network: NetworkName, name: StakingModuleName) {
  if (name == "Curated") return 1n;
  if (name == "SDVT") return 2n;
  throw new Error(`Unknown module name ${name}`);
}

function updateStakingModule(network: NetworkName, input: UpdateStakingModuleInput): OmnibusAction {
  const { callsScript, agent, voting, stakingRouter } = lido.eth[network]();
  const { stakingModule, targetShare, stakingModuleFee, treasuryFee } = input;
  const stakingModuleId = getStakingModuleId(network, stakingModule);

  return {
    title: `Update "${stakingModule}" staking module`,
    evmCall: forward(agent, [
      call(stakingRouter.updateStakingModule, [stakingModuleId, targetShare, stakingModuleFee, treasuryFee]),
    ]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stakingRouter, "StakingModuleTargetShareSet", {
        args: [stakingModuleId, targetShare, agent],
      }),
      event(stakingRouter, "StakingModuleFeesSet", {
        args: [stakingModuleId, stakingModuleFee, treasuryFee, agent],
      }),
      event(agent, "ScriptResult"),
    ],
  };
}

export default {
  updateStakingModule,
};
