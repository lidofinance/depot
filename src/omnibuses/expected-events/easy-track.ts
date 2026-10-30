import { Address } from "abitype";
import { toFunctionSelector } from "viem";

import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { EasyTrack_ABI } from "../../../abi/EasyTrack.abi";
import { Finance_ABI } from "../../../abi/Finance.abi";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import { Contract, getFunctionAbi } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type EasyTrackContract = Contract<typeof EasyTrack_ABI>;

function topUpEVMScriptFactoryPermission(finance: Address, registry: Address): HexStrPrefixed {
  return bytes.join(
    finance,
    toFunctionSelector(getFunctionAbi({ abi: Finance_ABI }, "newImmediatePayment")),
    registry,
    toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount")),
  );
}

function addRecipientEVMScriptFactoryPermission(registry: Address): HexStrPrefixed {
  return bytes.join(
    registry,
    toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient")),
  );
}

function removeRecipientEVMScriptFactoryPermission(registry: Address): HexStrPrefixed {
  return bytes.join(
    registry,
    toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient")),
  );
}

function factoryAdded(
  easyTrack: EasyTrackContract,
  input: { factory: Address; permission: HexStrPrefixed },
): OmnibusCallEvent[] {
  return [event(easyTrack, "EVMScriptFactoryAdded", [input.factory, input.permission])];
}

function factoryRemoved(easyTrack: EasyTrackContract, input: { factory: Address }): OmnibusCallEvent[] {
  return [event(easyTrack, "EVMScriptFactoryRemoved", [input.factory])];
}

function topUpFactoryAdded(
  easyTrack: EasyTrackContract,
  input: { factory: Address; finance: Address; registry: Address },
): OmnibusCallEvent[] {
  return factoryAdded(easyTrack, {
    factory: input.factory,
    permission: topUpEVMScriptFactoryPermission(input.finance, input.registry),
  });
}

function addRecipientFactoryAdded(
  easyTrack: EasyTrackContract,
  input: { factory: Address; registry: Address },
): OmnibusCallEvent[] {
  return factoryAdded(easyTrack, {
    factory: input.factory,
    permission: addRecipientEVMScriptFactoryPermission(input.registry),
  });
}

function removeRecipientFactoryAdded(
  easyTrack: EasyTrackContract,
  input: { factory: Address; registry: Address },
): OmnibusCallEvent[] {
  return factoryAdded(easyTrack, {
    factory: input.factory,
    permission: removeRecipientEVMScriptFactoryPermission(input.registry),
  });
}

export default {
  factoryAdded,
  factoryRemoved,
  topUpFactoryAdded,
  addRecipientFactoryAdded,
  removeRecipientFactoryAdded,
};
