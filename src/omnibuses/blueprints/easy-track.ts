import bytes, { HexStrPrefixed } from "../../common/bytes";
import { Address, toFunctionSelector } from "viem";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { getFunctionAbi } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../omnibus";
import { Finance_ABI } from "../../../abi/Finance.abi";

interface AddEvmScriptFactoryInput {
  title: string;
  factory: Address;
  permission: HexStrPrefixed;
}

interface RemoveEvmScriptFactoryInput {
  title: string;
  factory: Address;
}

function removeEvmScriptFactory(ctx: BlueprintCtx, { factory, title }: RemoveEvmScriptFactoryInput): OmnibusDirectCall {
  const { easyTrack } = ctx.contracts;

  return ctx.directCall(title, {
    on: easyTrack,
    fn: "removeEVMScriptFactory",
    args: [factory],
    events: [ctx.event(easyTrack, "EVMScriptFactoryRemoved", [factory])],
  });
}

function addEvmScriptFactory(
  ctx: BlueprintCtx,
  { title, factory, permission }: AddEvmScriptFactoryInput,
): OmnibusDirectCall {
  const { easyTrack } = ctx.contracts;
  return ctx.directCall(title, {
    on: easyTrack,
    fn: "addEVMScriptFactory",
    args: [factory, permission],
    events: [ctx.event(easyTrack, "EVMScriptFactoryAdded", [factory, permission])],
  });
}

interface AddPaymentEvmScriptFactoryInput {
  title: string;
  factory: Address;
  registry: Address;
}

export function topUpEVMScriptFactoryPermission(finance: Address, registry: Address) {
  return bytes.join(
    // allow to call finance.newImmediatePayment()
    ...[finance, toFunctionSelector(getFunctionAbi({ abi: Finance_ABI }, "newImmediatePayment"))],
    // allow to call allowedRecipientsRegistry.updateSpentAmount()
    ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount"))],
  );
}

export function addRecipientEVMScriptFactoryPermission(registry: Address) {
  return bytes.join(
    // allow to call allowedRecipientsRegistry.addRecipient()
    ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
  );
}
export function removeRecipientEVMScriptFactoryPermission(registry: Address) {
  return bytes.join(
    // allow to call allowedRecipientsRegistry.addRecipient()
    ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient"))],
  );
}

function addTopUpEvmScriptFactory(ctx: BlueprintCtx, input: AddPaymentEvmScriptFactoryInput): OmnibusDirectCall {
  const { finance } = ctx.contracts;
  return addEvmScriptFactory(ctx, {
    title: input.title,
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

function addAddRecipientEvmScriptFactory(ctx: BlueprintCtx, input: AddPaymentEvmScriptFactoryInput): OmnibusDirectCall {
  return addEvmScriptFactory(ctx, {
    title: input.title,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[input.registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
    ),
  });
}

function addRemoveRecipientEvmScriptFactory(
  ctx: BlueprintCtx,
  input: AddPaymentEvmScriptFactoryInput,
): OmnibusDirectCall {
  return addEvmScriptFactory(ctx, {
    title: input.title,
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

export default {
  addEvmScriptFactory,
  addTopUpEvmScriptFactory,
  addAddRecipientEvmScriptFactory,
  addRemoveRecipientEvmScriptFactory,
  removeEvmScriptFactory,
};
