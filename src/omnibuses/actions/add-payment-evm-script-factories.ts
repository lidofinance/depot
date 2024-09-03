import { call, event } from "../../votes";
import { AllowedRecipientsRegistry__factory } from "../../../typechain-types";
import bytes from "../../common/bytes";

import { Address } from "../../common/types";
import { LidoEthContracts } from "../../lido";

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface();

interface AddPaymentEvmScriptFactoriesInput {
  name: string;
  registry: Address;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

interface FactoryPermission {
  factory: Address;
  permission: string;
}

interface AddEvmScriptFactoryInput {
  factory: Address;
  registry: Address;
}

const AddTopUpEvmScriptFactory = (contracts: LidoEthContracts<"mainnet">, input: AddEvmScriptFactoryInput) => {
  const { finance } = contracts;
  const permission = bytes.join(
    // allow to call finance.newImmediatePayment()
    ...[finance.address, finance.newImmediatePayment.fragment.selector],
    // allow to call allowedRecipientsRegistry.updateSpentAmount()
    ...[input.registry, iAllowedRecipientsRegistry.getFunction("updateSpentAmount").selector],
  );
  return {
    factory: input.factory,
    permission,
  };
};

const AddAddRecipientEvmScriptFactory = (input: AddEvmScriptFactoryInput) => {
  const permission = bytes.join(
    // allow to call allowedRecipientsRegistry.addRecipient()
    ...[input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
  );
  return {
    factory: input.factory,
    permission,
  };
};

const AddRemoveRecipientEvmScriptFactory = (input: AddEvmScriptFactoryInput) => {
  const permission = bytes.join(
    // allow to call allowedRecipientsRegistry.removeRecipient()
    ...[input.registry, iAllowedRecipientsRegistry.getFunction("removeRecipient").selector],
  );
  return {
    factory: input.factory,
    permission,
  };
};

export const AddPaymentEvmScriptFactories = (
  contracts: LidoEthContracts<"mainnet">,
  input: AddPaymentEvmScriptFactoriesInput,
) => {
  const items: FactoryPermission[] = [
    AddTopUpEvmScriptFactory(contracts, {
      registry: input.registry,
      factory: input.factories.topUp,
    }),
  ];
  if (input.factories.addRecipient) {
    items.push(
      AddAddRecipientEvmScriptFactory({
        registry: input.registry,
        factory: input.factories.addRecipient,
      }),
    );
  }
  if (input.factories.removeRecipient) {
    items.push(
      AddRemoveRecipientEvmScriptFactory({
        registry: input.registry,
        factory: input.factories.removeRecipient,
      }),
    );
  }

  return {
    title: `Add "${input.name}" payment EVM Script Factories`,
    EVMCalls: items.flatMap((item) => call(contracts.easyTrack.addEVMScriptFactory, [item.factory, item.permission])),
    expectedEvents: items.flatMap((item) => [
      event(contracts.callsScript, "LogScriptCall", { emitter: contracts.voting }),
      event(contracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [item.factory, item.permission],
      }),
    ]),
  };
};
