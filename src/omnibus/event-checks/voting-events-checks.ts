import { getEventInfo } from "../events-info";
import { EventInfo, EventsInfoBuilder } from "../types";

function votingItems(votingEvents: EventInfo[]): EventsInfoBuilder {
  return ({ addresses, contracts }) => [
    getEventInfo({
      name: "LogScriptCall",
      address: addresses.voting,
      contract: contracts.callsScript,
    }),
    ...votingEvents,
  ];
}

export default { votingItems };
