import { Address } from "abitype";
import { decodeFunctionData, encodeEventTopics, Log } from "viem";

import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import bytes, { HexStrPrefixed } from "../common/bytes";
import { event } from "./event-helpers";
import { GovernanceContracts } from "./governance-contracts";
import { LogCollector, LogWindow } from "./log-collector";
import { isSubmitProposalCall } from "./omnibus-contract-calls";
import { OmnibusCallEvent, VoteCall } from "./omnibus-types";

export interface ExternalCall {
  target: Address;
  value: bigint;
  payload: HexStrPrefixed;
}

export function decodeSubmitProposal(call: VoteCall): { calls: ExternalCall[]; metadata: string } {
  const decoded = decodeFunctionData({ abi: IGovernance_ABI, data: call.payload });
  if (decoded.functionName !== "submitProposal") {
    throw new Error(`Vote item "${call.title}" doesn't call "submitProposal" but "${decoded.functionName}"`);
  }
  const [calls, metadata] = decoded.args;
  return { calls: calls.map((item) => ({ ...item })), metadata };
}

function isLogOf(log: Log, emitter: Address, topic: HexStrPrefixed) {
  return bytes.isEqual(log.address, emitter) && log.topics[0] !== undefined && bytes.isEqual(log.topics[0], topic);
}

/**
 * Events of an executed vote, addressed by item title. The receipt is split into items by the
 * `LogScriptCall` boundaries; each item gets its structural envelope added, the test declares only
 * the domain events.
 */
export class VoteEvents {
  readonly #collector: LogCollector;
  readonly #calls: VoteCall[];
  readonly #governance: GovernanceContracts;
  readonly #evmScript: HexStrPrefixed;
  readonly #windows: LogWindow[];

  constructor(collector: LogCollector, calls: VoteCall[], governance: GovernanceContracts, evmScript: HexStrPrefixed) {
    this.#collector = collector;
    this.#calls = calls;
    this.#governance = governance;
    this.#evmScript = evmScript;
    this.#windows = this.#splitByItems();
  }

  get titles(): string[] {
    return this.#calls.map((call) => call.title);
  }

  item(title: string, events: OmnibusCallEvent[] = []) {
    return this.itemAt(this.#indexOf(title), events);
  }

  /** For repeated titles. Zero-based. */
  itemAt(index: number, events: OmnibusCallEvent[] = []) {
    const call = this.#calls[index];
    if (!call) {
      throw new Error(`Vote has ${this.#calls.length} items, there is no item at index ${index}`);
    }
    this.#collector.assertEvents([...this.#envelopeOf(call), ...events], this.#windows[index]);
  }

  /** `ScriptResult` + `ExecuteVote`; called by the core after `testVote`. */
  assertTail() {
    const { voting, callsScript } = this.#governance;
    const tailWindow: LogWindow = { from: this.#windows[this.#windows.length - 1]?.to ?? 0, to: Infinity };
    this.#collector.assertEvents(
      [
        event(voting, "ScriptResult", [callsScript.address, this.#evmScript, "0x", "0x"]),
        event(voting, "ExecuteVote", [null]),
      ],
      tailWindow,
    );
  }

  #indexOf(title: string): number {
    const indexes = this.#calls.flatMap((call, index) => (call.title === title ? [index] : []));
    if (indexes.length === 1) {
      return indexes[0];
    }
    if (indexes.length === 0) {
      const known = this.titles.map((knownTitle, index) => `  ${index}. ${knownTitle}`).join("\n");
      throw new Error(`Vote has no item titled "${title}". Items:\n${known}`);
    }
    throw new Error(`Vote has ${indexes.length} items titled "${title}" — use itemAt(${indexes.join(" | ")})`);
  }

  #envelopeOf(call: VoteCall): OmnibusCallEvent[] {
    const { voting, callsScript, timelock, dualGovernance } = this.#governance;
    const logScriptCall = event(callsScript, "LogScriptCall", [null, voting.address, call.target], {
      emitter: voting.address,
    });

    if (!isSubmitProposalCall(call, dualGovernance.address)) {
      return [logScriptCall];
    }

    const { calls, metadata } = decodeSubmitProposal(call);
    return [
      logScriptCall,
      event(timelock, "ProposalSubmitted", [null, null, calls]),
      event(dualGovernance, "ProposalSubmitted", [voting.address, null, metadata]),
    ];
  }

  #splitByItems(): LogWindow[] {
    const { voting, callsScript } = this.#governance;
    const [logScriptCallTopic] = encodeEventTopics({ abi: callsScript.abi, eventName: "LogScriptCall" });
    const [scriptResultTopic] = encodeEventTopics({ abi: voting.abi, eventName: "ScriptResult" });

    const boundaries = this.#collector.findLogIndexes((log) => isLogOf(log, voting.address, logScriptCallTopic));
    const [scriptResultIndex] = this.#collector.findLogIndexes((log) =>
      isLogOf(log, voting.address, scriptResultTopic),
    );

    if (boundaries.length !== this.#calls.length) {
      throw new Error(
        `Vote has ${this.#calls.length} items but the receipt has ${boundaries.length} "LogScriptCall" logs`,
      );
    }
    if (scriptResultIndex === undefined) {
      throw new Error(`Receipt has no "ScriptResult" log of the Voting contract`);
    }

    return boundaries.map((from, index) => ({ from, to: boundaries[index + 1] ?? scriptResultIndex }));
  }
}

/** Events of an executed Dual Governance proposal, addressed by call index; split by `Executed` logs. */
export class ProposalEvents {
  readonly #collector: LogCollector;
  readonly #calls: ExternalCall[];
  readonly #governance: GovernanceContracts;
  readonly #windows: LogWindow[];

  constructor(collector: LogCollector, calls: ExternalCall[], governance: GovernanceContracts) {
    this.#collector = collector;
    this.#calls = calls;
    this.#governance = governance;
    this.#windows = this.#splitByCalls();
  }

  get callsCount(): number {
    return this.#calls.length;
  }

  call(index: number, events: OmnibusCallEvent[] = []) {
    const call = this.#calls[index];
    if (!call) {
      throw new Error(`Proposal has ${this.#calls.length} calls, there is no call at index ${index}`);
    }
    const executed = event(this.#governance.adminExecutor, "Executed", [call.target, call.value, call.payload, null]);
    this.#collector.assertEvents([...events, executed], this.#windows[index]);
  }

  assertTail() {
    const tailWindow: LogWindow = { from: this.#windows[this.#windows.length - 1]?.to ?? 0, to: Infinity };
    this.#collector.assertEvents([event(this.#governance.timelock, "ProposalExecuted", [null])], tailWindow);
  }

  #splitByCalls(): LogWindow[] {
    const { adminExecutor } = this.#governance;
    const [executedTopic] = encodeEventTopics({ abi: adminExecutor.abi, eventName: "Executed" });
    const executedIndexes = this.#collector.findLogIndexes((log) => isLogOf(log, adminExecutor.address, executedTopic));

    if (executedIndexes.length !== this.#calls.length) {
      throw new Error(
        `Proposal has ${this.#calls.length} calls but the receipt has ${executedIndexes.length} "Executed" logs`,
      );
    }

    return executedIndexes.map((executedIndex, index) => ({
      from: index === 0 ? 0 : executedIndexes[index - 1] + 1,
      to: executedIndex + 1,
    }));
  }
}
