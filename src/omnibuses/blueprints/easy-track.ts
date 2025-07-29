import bytes, { HexStrPrefixed } from "../../common/bytes";
import { Address, toFunctionSelector } from "viem";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { getFunctionAbi } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../tools/create-omnibus";

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
  ctx: BlueprintCtx,
  { factory, title }: RemovePaymentEvmScriptFactoryInput,
): OmnibusDirectCall {
  const { easyTrack } = ctx.contracts;
  return ctx.call(easyTrack, "removeEVMScriptFactory", [factory], {
    title: title,
    events: [ctx.event(easyTrack, "EVMScriptFactoryRemoved", [factory])],
  });
}

function addEvmScriptFactory(ctx: BlueprintCtx, input: AddEvmScriptFactoryInput): OmnibusDirectCall {
  const { easyTrack } = ctx.contracts;
  return ctx.call(easyTrack, "addEVMScriptFactory", [input.factory, input.permission], {
    title: input.title,
    events: [ctx.event(easyTrack, "EVMScriptFactoryAdded", [input.factory, input.permission])],
  });
}

interface AddNamedEvmScriptFactoryInput {
  name: string;
  factory: Address;
  registry: Address;
}

function addTopUpEvmScriptFactory(ctx: BlueprintCtx, input: AddNamedEvmScriptFactoryInput): OmnibusDirectCall {
  const { finance } = ctx.contracts;
  return addEvmScriptFactory(ctx, {
    title: `Add top up EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call finance.newImmediatePayment()
      ...[finance.address, toFunctionSelector(getFunctionAbi(finance, "newImmediatePayment"))],
      // allow to call allowedRecipientsRegistry.updateSpentAmount()
      ...[
        input.registry,
        toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount")),
      ],
    ),
  });
}

function addAddRecipientEvmScriptFactory(ctx: BlueprintCtx, input: AddNamedEvmScriptFactoryInput): OmnibusDirectCall {
  return addEvmScriptFactory(ctx, {
    title: `Add add recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[input.registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
    ),
  });
}

function addRemoveRecipientEvmScriptFactory(
  ctx: BlueprintCtx,
  input: AddNamedEvmScriptFactoryInput,
): OmnibusDirectCall {
  return addEvmScriptFactory(ctx, {
    title: `Add remove recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.removeRecipient()
      ...[
        input.registry,
        toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient")),
      ],
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

function addPaymentEvmScriptFactories(
  ctx: BlueprintCtx,
  input: AddPaymentEvmScriptFactoriesInput,
): OmnibusDirectCall[] {
  const commonInput = { name: input.name, registry: input.registry };
  const res: OmnibusDirectCall[] = [addTopUpEvmScriptFactory(ctx, { ...commonInput, factory: input.factories.topUp })];
  if (input.factories.addRecipient) {
    res.push(addAddRecipientEvmScriptFactory(ctx, { ...commonInput, factory: input.factories.addRecipient }));
  }
  if (input.factories.removeRecipient) {
    res.push(addRemoveRecipientEvmScriptFactory(ctx, { ...commonInput, factory: input.factories.removeRecipient }));
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
  ctx: BlueprintCtx,
  input: RemovePaymentEvmScriptFactoriesInput,
): OmnibusDirectCall[] {
  const res: OmnibusDirectCall[] = [
    removeEvmScriptFactory(ctx, {
      title: `Remove Top Up EVM Script Factory "${input.factories.topUp}"`,
      factory: input.factories.topUp,
    }),
  ];
  if (input.factories.addRecipient) {
    res.push(
      removeEvmScriptFactory(ctx, {
        title: `Remove Add Recipient EVM Script Factory "${input.factories.addRecipient}"`,
        factory: input.factories.addRecipient,
      }),
    );
  }
  if (input.factories.removeRecipient) {
    res.push(
      removeEvmScriptFactory(ctx, {
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
