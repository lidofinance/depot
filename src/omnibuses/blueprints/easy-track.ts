import bytes, { HexStrPrefixed } from "../../common/bytes";
import { Address, toFunctionSelector } from "viem";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { Contract, getFunctionAbi } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../omnibus";
import { Finance_ABI } from "../../../abi/Finance.abi";
import { EasyTrack_ABI } from "../../../abi/EasyTrack.abi";

interface AddEvmScriptFactoryInput {
  title: string;
  factory: Address;
  permission: HexStrPrefixed;
}

interface RemoveEvmScriptFactoryInput {
  title: string;
  factory: Address;
}

type FinanceContract = Contract<typeof Finance_ABI>;
type EasyTrackContract = Contract<typeof EasyTrack_ABI>;

function removeEvmScriptFactory(
  ctx: BlueprintCtx,
  { easyTrack }: { easyTrack: EasyTrackContract },
  { factory, title }: RemoveEvmScriptFactoryInput,
): OmnibusDirectCall {
  return ctx.directCall(title, {
    on: easyTrack,
    fn: "removeEVMScriptFactory",
    args: [factory],
    events: [ctx.event(easyTrack, "EVMScriptFactoryRemoved", [factory])],
  });
}

function addEvmScriptFactory(
  ctx: BlueprintCtx,
  { easyTrack }: { easyTrack: EasyTrackContract },
  { title, factory, permission }: AddEvmScriptFactoryInput,
): OmnibusDirectCall {
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

function addTopUpEvmScriptFactory(
  ctx: BlueprintCtx,
  { easyTrack, finance }: { easyTrack: EasyTrackContract; finance: FinanceContract },
  input: AddPaymentEvmScriptFactoryInput,
): OmnibusDirectCall {
  return addEvmScriptFactory(
    ctx,
    { easyTrack },
    {
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
    },
  );
}

function addAddRecipientEvmScriptFactory(
  ctx: BlueprintCtx,
  { easyTrack }: { easyTrack: EasyTrackContract },
  input: AddPaymentEvmScriptFactoryInput,
): OmnibusDirectCall {
  return addEvmScriptFactory(
    ctx,
    { easyTrack },
    {
      title: input.title,
      factory: input.factory,
      permission: bytes.join(
        // allow to call allowedRecipientsRegistry.addRecipient()
        ...[input.registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
      ),
    },
  );
}

function addRemoveRecipientEvmScriptFactory(
  ctx: BlueprintCtx,
  { easyTrack }: { easyTrack: EasyTrackContract },
  input: AddPaymentEvmScriptFactoryInput,
): OmnibusDirectCall {
  return addEvmScriptFactory(
    ctx,
    { easyTrack },
    {
      title: input.title,
      factory: input.factory,
      permission: bytes.join(
        // allow to call allowedRecipientsRegistry.removeRecipient()
        ...[
          input.registry,
          toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient")),
        ],
      ),
    },
  );
}

export default {
  addEvmScriptFactory,
  addTopUpEvmScriptFactory,
  addAddRecipientEvmScriptFactory,
  addRemoveRecipientEvmScriptFactory,
  removeEvmScriptFactory,
};
