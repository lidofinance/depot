import { EventsInfoBuilder } from "../types";
import { getEventInfo } from "../events-info";
import votingEventsChecks from "./voting-events-checks";

function forward(forwardEvents: EventsInfoBuilder): EventsInfoBuilder {
  return (ctx) =>
    votingEventsChecks.votingItems([
      getEventInfo({
        name: "LogScriptCall",
        address: ctx.addresses.agent,
        contract: ctx.contracts.callsScript,
      }),
      ...forwardEvents(ctx),
      getEventInfo({ name: "ScriptResult", contract: ctx.contracts.agent }),
    ])(ctx);
}

export default { forward };
