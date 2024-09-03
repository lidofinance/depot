import { call, event } from "../../votes";

import { Address } from "../../common/types";
import { LidoEthContracts } from "../../lido";
import { OmnibusAction } from "../omnibus-action";

interface RemovePaymentEvmScriptFactoriesInput {
  name: string;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

export const RemovePaymentEvmScriptFactories = (
  contracts: LidoEthContracts<"mainnet">,
  input: RemovePaymentEvmScriptFactoriesInput,
): OmnibusAction[] => {
  const { easyTrack, callsScript, voting } = contracts;
  const factoriesToRemove = [input.factories.topUp];
  if (input.factories.addRecipient) {
    factoriesToRemove.push(input.factories.addRecipient);
  }
  if (input.factories.removeRecipient) {
    factoriesToRemove.push(input.factories.removeRecipient);
  }

  return factoriesToRemove.map((factory) => ({
    title: `Remove "${input.name}" factory ${factory} payment EVM Script Factories`,
    evmCall: call(easyTrack.removeEVMScriptFactory, [factory]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(easyTrack, "EVMScriptFactoryRemoved", { args: [factory] }),
    ],
  }));
};
