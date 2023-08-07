import { EventsInfoBuilder } from "../types";
import votingEventsChecks from "./voting-events-checks";

interface AddEvmScriptFactoryOptions {
  factory: Address;
  permissions: string;
}

function addEvmScriptFactory({
  factory,
  permissions,
}: AddEvmScriptFactoryOptions): EventsInfoBuilder {
  return (lido) =>
    votingEventsChecks.votingItems([
      {
        address: lido.contracts.easyTrack.address,
        fragment: lido.contracts.easyTrack.interface.getEvent("EVMScriptFactoryAdded"),
        args: [factory, permissions],
      },
    ])(lido);
}

interface RemoveEvmScriptFactoryOptions {
  factory: Address;
}

function removeEvmScriptFactory({ factory }: RemoveEvmScriptFactoryOptions): EventsInfoBuilder {
  return (lido) =>
    votingEventsChecks.votingItems([
      {
        address: lido.addresses.easyTrack,
        fragment: lido.contracts.easyTrack.interface.getEvent("EVMScriptFactoryRemoved"),
        args: [factory],
      },
    ])(lido);
}

export default { addEvmScriptFactory, removeEvmScriptFactory };
