import { LidoEthContracts } from "../../lido";
import { partial } from "lodash";
import { AddNodeOperators } from "./add-node-operators";
import { UpdateStakingModule } from "./update-staking-module";
import { TransferAssets } from "./transfer-assets";
import { AddPaymentEvmScriptFactories } from "./add-payment-evm-script-factories";
import { RemovePaymentEvmScriptFactories } from "./remove-payment-evm-script-factories";

export const omnibusActions = (contracts: LidoEthContracts<"mainnet">) => {
  return {
    stakingRouter: {
      addNodeOperators: partial(AddNodeOperators, contracts),
      updateStakingModule: partial(UpdateStakingModule, contracts),
    },
    assets: {
      transfer: partial(TransferAssets, contracts),
    },
    easyTrack: {
      addPaymentEvmScriptFactories: partial(AddPaymentEvmScriptFactories, contracts),
      removePaymentEvmScriptFactories: partial(RemovePaymentEvmScriptFactories, contracts),
    },
  };
};
