import { Address } from "web3-types";
import lido from "../../lido";
import { OmnibusAction } from "../omnibus-action";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import { NetworkName } from "../../networks";
import { call, event } from "../../votes";
import { AllowedRecipientsRegistry__factory } from "../../../typechain-types";

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface();

interface CommonManageEvmScriptFactoryInput {
  title: string;
  factory: Address;
}

interface AddEvmScriptFactoryInput extends CommonManageEvmScriptFactoryInput {
  permission: HexStrPrefixed;
}

interface RemovePaymentEvmScriptFactoryInput {
  title: string;
  factory: Address;
}

function removeEvmScriptFactory(
  network: NetworkName,
  { factory, title }: RemovePaymentEvmScriptFactoryInput,
): OmnibusAction {
  const { easyTrack, callsScript, voting } = lido.eth[network]();
  return {
    title: title,
    evmCall: call(easyTrack.removeEVMScriptFactory, [factory]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(easyTrack, "EVMScriptFactoryRemoved", { args: [factory] }),
    ],
  };
}

function addEvmScriptFactory(network: NetworkName, input: AddEvmScriptFactoryInput): OmnibusAction {
  const { easyTrack, callsScript, voting } = lido.eth[network]();
  return {
    title: input.title,
    evmCall: call(easyTrack.addEVMScriptFactory, [input.factory, input.permission]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(easyTrack, "EVMScriptFactoryAdded", {
        args: [input.factory, input.permission],
      }),
    ],
  };
}

interface AddNamedEvmScriptFactoryInput {
  name: string;
  factory: Address;
  registry: Address;
}

function addTopUpEvmScriptFactory(network: NetworkName, input: AddNamedEvmScriptFactoryInput): OmnibusAction {
  return addEvmScriptFactory(network, {
    title: `Add top up EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
    ),
  });
}

function addAddRecipientEvmScriptFactory(network: NetworkName, input: AddNamedEvmScriptFactoryInput): OmnibusAction {
  return addEvmScriptFactory(network, {
    title: `Add add recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
    ),
  });
}

function addRemoveRecipientEvmScriptFactory(network: NetworkName, input: AddNamedEvmScriptFactoryInput): OmnibusAction {
  return addEvmScriptFactory(network, {
    title: `Add remove recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.removeRecipient()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction("removeRecipient").selector],
    ),
  });
}

interface AddPaymentEvmScriptFactoriesInput {
  name: string;
  registry: Address;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

function addPaymentEvmScriptFactories(network: NetworkName, input: AddPaymentEvmScriptFactoriesInput): OmnibusAction[] {
  const commonInput = { name: input.name, registry: input.registry };
  const res: OmnibusAction[] = [addTopUpEvmScriptFactory(network, { ...commonInput, factory: input.factories.topUp })];
  if (input.factories.addRecipient) {
    res.push(addAddRecipientEvmScriptFactory(network, { ...commonInput, factory: input.factories.addRecipient }));
  }
  if (input.factories.removeRecipient) {
    res.push(addAddRecipientEvmScriptFactory(network, { ...commonInput, factory: input.factories.removeRecipient }));
  }
  return res;
}

interface RemovePaymentEvmScriptFactoriesInput {
  name: string;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

function removePaymentEvmScriptFactories(
  network: NetworkName,
  input: RemovePaymentEvmScriptFactoriesInput,
): OmnibusAction[] {
  const res: OmnibusAction[] = [
    removeEvmScriptFactory(network, {
      title: `Remove Top Up EVM Script Factory "${input.factories.topUp}"`,
      factory: input.factories.topUp,
    }),
  ];
  if (input.factories.addRecipient) {
    res.push(
      removeEvmScriptFactory(network, {
        title: `Remove Add Recipient EVM Script Factory "${input.factories.addRecipient}"`,
        factory: input.factories.addRecipient,
      }),
    );
  }
  if (input.factories.removeRecipient) {
    res.push(
      removeEvmScriptFactory(network, {
        title: `Remove Remove Recipient EVM Script Factory "${input.factories.addRecipient}"`,
        factory: input.factories.removeRecipient,
      }),
    );
  }
  return res;
}

export default {
  addEvmScriptFactory,
  addTopUpEvmScriptFactory,
  addAddRecipientEvmScriptFactory,
  addRemoveRecipientEvmScriptFactory,
  addPaymentEvmScriptFactories,
  removeEvmScriptFactory,
  removePaymentEvmScriptFactories,
};
