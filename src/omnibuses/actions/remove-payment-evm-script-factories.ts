import { EventCheck, FormattedEvmCall, call, event } from "../../votes";

import { Address } from "../../common/types";
import { LidoEthContracts } from "../../lido";

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
) => {
  const { easyTrack, callsScript, voting } = contracts;
  const factoriesToRemove = [input.factories.topUp];
  if (input.factories.addRecipient) {
    factoriesToRemove.push(input.factories.addRecipient);
  }
  if (input.factories.removeRecipient) {
    factoriesToRemove.push(input.factories.removeRecipient);
  }

  return {
    title: `Remove "${input.name}" payment EVM Script Factories`,
    getEVMCalls(): FormattedEvmCall[] {
      return factoriesToRemove.map((factory) => call(easyTrack.removeEVMScriptFactory, [factory]));
    },
    getExpectedEvents(): EventCheck[] {
      return factoriesToRemove.flatMap((factory) => [
        event(callsScript, "LogScriptCall", { emitter: voting }),
        event(easyTrack, "EVMScriptFactoryRemoved", { args: [factory] }),
      ]);
    },
  };
};
