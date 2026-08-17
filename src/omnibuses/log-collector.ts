import chalk from "chalk";
import { Log } from "viem";
import { formatAbiItem } from "viem/utils";

import fmt from "../common/format";
import { assertEventWithLog, formatOmnibusCallEvent } from "./event-helpers";
import type { OmnibusCallEvent } from "./omnibus-types";

/**
 * Keeps the logs of an executed transaction together with the marks of which of them are already
 * explained by an assertion. A log left unexplained by the end of the test fails it: the test can
 * only pass by accounting for everything the omnibus emitted.
 */
export class LogCollector {
  readonly #logs: Log[];
  readonly #consumedFlags: boolean[];

  constructor(logs: Log[]) {
    this.#logs = logs;
    this.#consumedFlags = new Array(logs.length).fill(false);
  }

  /**
   * Matches the expected events against the logs not consumed yet, in the order they were emitted,
   * and marks the matched ones consumed.
   */
  assertEvents(expectedEvents: OmnibusCallEvent[]) {
    const pendingLogIndexes = this.#logs
      .map((_, logIndex) => logIndex)
      .filter((logIndex) => !this.#consumedFlags[logIndex]);

    let pendingCursor = 0;
    let eventIndex = 0;
    const matchedCounts: number[] = new Array(expectedEvents.length).fill(0);

    while (eventIndex < expectedEvents.length) {
      const expectedEvent = expectedEvents[eventIndex];
      const eventNumber = eventIndex + 1;
      const hadMatchedBefore = matchedCounts[eventIndex] > 0;
      const logIndex = pendingLogIndexes[pendingCursor];

      if (logIndex === undefined) {
        // an event allowed to be emitted multiple times is satisfied by the matches it already has
        if (!expectedEvent.isOptional && !hadMatchedBefore) {
          throw new Error(`No log left to match the expected event "${formatAbiItem(expectedEvent.abi)}"`);
        }
        eventIndex++;
        continue;
      }

      const { skipped } = assertEventWithLog(this.#logs[logIndex], expectedEvent);

      if (!skipped) {
        matchedCounts[eventIndex]++;
        this.#consumedFlags[logIndex] = true;
        pendingCursor++;
      }

      // an event allowed to be emitted multiple times is matched with the logs until it stops matching
      if (skipped || !expectedEvent.allowMultiple) {
        eventIndex++;
      }

      if (skipped) {
        // for an event already matched at least once, a mismatch simply means "no more of this event"
        if (expectedEvent.allowMultiple && hadMatchedBefore) {
          continue;
        }
        console.log(
          fmt.padded(`${chalk.yellowBright("✗")} ${eventNumber}. ${formatOmnibusCallEvent(expectedEvent, skipped)}`, 3),
        );
      } else {
        console.log(
          fmt.padded(`${chalk.greenBright("✔")} ${eventNumber}. ${formatOmnibusCallEvent(expectedEvent, skipped)}`, 3),
        );
      }
    }
  }

  assertNothingLeft() {
    const leftoverLogs = this.#logs.filter((_, logIndex) => !this.#consumedFlags[logIndex]);

    if (leftoverLogs.length > 0) {
      const formattedLogs = leftoverLogs.map(
        (log) => `  - ${log.address} ${log.topics[0] ?? "anonymous"} (log index ${log.logIndex})`,
      );
      throw new Error([`Unchecked log items left (${leftoverLogs.length}):`, ...formattedLogs].join("\n"));
    }

    console.log(fmt.padded(`${chalk.greenBright("✔")} All events validated`, 3));
  }
}
