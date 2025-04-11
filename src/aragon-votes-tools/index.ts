import { EventCheck, EventsGroup } from "./events";
import { EvmCall } from "./evm-script-parser";
import { start, wait, execute } from "./lifecycle";
import { adopt, creator, pass } from "./testing";
import { trace } from "./trace";

export { event } from "./events";
export { evm, call, forward } from "./vote-script";
export type { FormattedEvmCall } from "./vote-script";

export { EvmScriptParser } from "./evm-script-parser";

export type { EventCheck, EventsGroup, EvmCall };
export default {
  start,
  execute,
  wait,
  adopt,
  creator,
  pass,
  trace,
};
