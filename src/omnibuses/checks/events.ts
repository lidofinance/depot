import { BaseContract, EventFragment, EventLog, Interface, Log } from "ethers";
import { Receipt } from "web3-types";
import { assert } from "../../common/assert";
import { event, EventCheck } from "../../votes";
import bytes from "../../common/bytes";
import lido from "../../lido";
import contracts from "../../contracts";
import { OmnibusItem } from "../omnibuses";
import { CheckContext } from "./checks";

const checkOmnibusEvents = ({ contracts }: CheckContext, actions: OmnibusItem[], receipt: Receipt) => {
  let logs = receipt.logs as Log[];

  for (const action of actions) {
    const [foundEventsCount, absentEvents] = matchLogsToEvents(logs, action.expectedEvents);

    assert.equal(
      absentEvents.length,
      0,
      `Logs doesn't match with "${action?.title}" expected events with following names:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
    );

    logs = logs.slice(foundEventsCount);
  }

  //Check the remaining logs for omnibus events
  const expectedVotingEvents = [event(contracts.voting, "ScriptResult"), event(contracts.voting, "ExecuteVote")];
  const votingLogs = logs.slice(0, expectedVotingEvents.length);

  const [foundEventsCount, absentEvents] = matchLogsToEvents(votingLogs, expectedVotingEvents);
  assert.equal(
    absentEvents.length,
    0,
    `Logs doesn't match with events expected events with following names:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
  );

  // Check that there are no unexpected logs
  logs = logs.slice(foundEventsCount);
  assert.isEmpty(logs, "Unexpected logs");
};

function matchLogAndEvent(log?: Log, event?: EventCheck) {
  if (!log || !event) return false;
  if (!bytes.isEqual(log.address, event.address)) return false;
  if (!bytes.isEqual(log.topics[0]!, event.fragment.topicHash)) return false;
  return !(event.args && !isArgsMatches(log, event.fragment, event.args));
}

/** Iterates over events and searches for logs in the same sequence. */
export function matchLogsToEvents(logs: Log[], events: EventCheck[]): [number, EventCheck[]] {
  const absentEvents: EventCheck[] = [];
  let foundEventsCount = 0;
  let logsIndex = 0;
  for (let eventIndex = 0; eventIndex < events.length; ++eventIndex) {
    const event = events[eventIndex]!;
    const log = logs[logsIndex];
    logsIndex += 1;
    // An optional event has relation 1 to N(⩾0) with log items
    if (matchLogAndEvent(log, event)) {
      foundEventsCount += 1;
      if (event.params?.optional) {
        // current event relation 1 to N(⩾1) require compare same event with next log item
        eventIndex -= 1;
      }
      continue;
    }
    if (event.params?.optional) {
      // current event relation 1 to 0 require compare next event with same log item
      logsIndex -= 1;
      continue;
    }
    absentEvents.push(event);
  }

  return [foundEventsCount, absentEvents];
}

const EMPTY_INTERFACE = new Interface([]);

function isArgsMatches(log: Log, fragment: EventFragment, eventArgs: unknown[]): boolean {
  const { args: logArgs } = new EventLog(log, EMPTY_INTERFACE, fragment);
  if (eventArgs.length !== logArgs.length) return false;

  for (let i = 0; i < eventArgs.length; ++i) {
    const logArg = logArgs[i];
    const eventArg = eventArgs[i];

    if (eventArg === undefined) continue;

    const eventArgValue = eventArg instanceof BaseContract ? contracts.address(eventArg) : eventArg;

    // TODO: comparison of different types
    if (logArg == eventArgValue) continue;

    if (!bytes.isValid(logArg) && !bytes.isValid(eventArgValue)) return false;
    if (!bytes.isEqual(logArg, eventArgValue as string)) return false;
  }
  return true;
}

export default {
  checkOmnibusEvents,
};
