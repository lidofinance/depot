import { BaseContract, EventFragment, EventLog, Interface, Log } from "ethers";
import { Receipt } from "web3-types";
import { assert } from "../../common/assert";
import { event, EventCheck } from "../../votes";
import bytes from "../../common/bytes";
import lido from "../../lido";
import contracts from "../../contracts";
import { OmnibusAction } from "../omnibuses";
import { CheckContext } from "./checks";

const checkOmnibusEvents = ({ contracts }: CheckContext, actions: OmnibusAction[], receipt: Receipt) => {
  let logs = receipt.logs as Log[];

  for (const action of actions) {
    const actionLogs = logs.slice(0, action.expectedEvents.length);

    const [foundEventsCount, absentEvents] = matchLogsToEvents(actionLogs, action.expectedEvents);

    assert.equal(
      absentEvents.length,
      0,
      `Events for action ${action.constructor.name} not found:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
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
    `Events for voting not found:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
  );

  // Check that there are no unexpected logs
  logs = logs.slice(foundEventsCount);
  assert.isEmpty(logs, "Unexpected logs");
};

// This function is ONLY for the subsequence function debugging
// Usage: const [contract, parsedLog] = parseLog(log);
export function parseLog(log: { topics: ReadonlyArray<string>; data: string }) {
  const contracts = lido.chainId(1n);
  for (const contract of Object.values(contracts)) {
    const parsedLog = contract.interface.parseLog(log);
    if (parsedLog) return [contract, parsedLog];
  }
  return [null, null];
}

function matchLogAndEvent(log: Log, event: EventCheck) {
  if (!bytes.isEqual(log.address, event.address)) return false;
  if (!bytes.isEqual(log.topics[0]!, event.fragment.topicHash)) return false;
  return !(event.args && !isArgsMatches(log, event.fragment, event.args));
}

export function matchLogsToEvents(logs: Log[], events: EventCheck[]): [number, EventCheck[]] {
  const absentEvents: EventCheck[] = [];
  let foundEventsCount = 0;

  let eventIndex = 0;
  for (let logsIndex = 0; logsIndex < logs.length; ++logsIndex) {
    if (eventIndex === events.length) break;
    const log = logs[logsIndex]!;
    const event = events[eventIndex]!;
    eventIndex += 1;
    if (matchLogAndEvent(log, event)) {
      foundEventsCount += 1;
      continue;
    }
    if (event.params?.optional) {
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

    // TODO: comparision of different types
    if (logArg == eventArgValue) continue;

    if (!bytes.isValid(logArg) && !bytes.isValid(eventArgValue)) return false;
    if (!bytes.isEqual(logArg, eventArgValue as string)) return false;
  }
  return true;
}

export default {
  checkOmnibusEvents,
};
