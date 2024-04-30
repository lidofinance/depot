import { BaseContract, EventFragment, EventLog, Interface, Log } from "ethers";
import bytes from "../common/bytes";
import contracts from "../contracts";
import { TypedContractEvent } from "../../typechain-types/common";
import { OverloadedInputResultMap } from "./overloaded-types-helper";
import { Address } from "../common/types";

export interface EventCheck {
  args?: unknown[];
  address: Address;
  fragment: EventFragment;
}

export interface EventsGroup {
  name: string;
  events: EventCheck[];
}

type TypedContract = BaseContract & {
  getEvent(key: string): TypedContractEvent;
};

interface MakeEventCheckParams<T extends TypedContract, K extends keyof OverloadedInputResultMap<T["getEvent"]>> {
  args?: Parameters<OverloadedInputResultMap<T["getEvent"]>[K]["getFragment"]>;
  emitter?: Address | BaseContract;
}

class EventFragmentNotFoundError extends Error {
  constructor(name: string, contract: BaseContract) {
    super(`EventFragment ${name} not found in the ${contracts.label(contract)} (${contracts.address(contract)})`);
  }
}

const EMPTY_INTERFACE = new Interface([]);

export function event<T extends TypedContract, K extends keyof OverloadedInputResultMap<T["getEvent"]>>(
  contract: T,
  event: K,
  { args, emitter: address }: MakeEventCheckParams<T, K> = {},
): EventCheck {
  const fragment = contract.getEvent(event as string).fragment;
  if (!fragment) {
    throw new EventFragmentNotFoundError(event as string, contract);
  }
  return {
    args,
    fragment,
    address: contracts.address(address ?? contract),
  };
}

export function subsequence(logs: Log[], subsequence: EventCheck[], fromIndex: number) {
  const result: number[] = new Array(subsequence.length).fill(-1);

  let eventsIndex = 0;
  for (let logsIndex = fromIndex; logsIndex < logs.length; ++logsIndex) {
    if (eventsIndex === subsequence.length) break;
    const log = logs[logsIndex]!;
    const { fragment, address, args } = subsequence[eventsIndex]!;
    if (!bytes.isEqual(log.address, address)) continue;
    if (!bytes.isEqual(log.topics[0]!, fragment.topicHash)) continue;
    if (args && !isArgsMatches(log, fragment, args)) continue;
    result[eventsIndex] = logsIndex;
    eventsIndex += 1;
  }
  return result;
}

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
