import { Address } from "abitype";

import { EasyTrack_ABI } from "../../../abi/EasyTrack.abi";
import { HexStrPrefixed } from "../../common/bytes";
import { Contract } from "../../contracts";
import {
  addRecipientEVMScriptFactoryPermission,
  removeRecipientEVMScriptFactoryPermission,
  topUpEVMScriptFactoryPermission,
} from "../blueprints/easy-track";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type EasyTrackContract = Contract<typeof EasyTrack_ABI>;

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
