import { default as erc20 } from "./erc20-events-checks";
import { default as agent } from "./agent-events-checks";
import { default as burner } from "./burner-event-checks";
import { default as easyTrack } from "./easy-track-events-checks";
import { default as insuranceFund } from "./insurance-fund-events-checks";

export type EventsChecks = typeof eventsChecks;

const eventsChecks = {
  erc20,
  agent,
  burner,
  easyTrack,
  insuranceFund,
};

export default eventsChecks;
