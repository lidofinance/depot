import { AbiEvent, Address, formatAbiItem } from "abitype";
import chalk from "chalk";
import deepEqual from "deep-eql";
import { decodeEventLog, encodeEventTopics, Log, TransactionReceipt } from "viem";

import bytes from "../common/bytes";
import { Contract, getEventAbi } from "../contracts";
import { FilterAbiEvents, FindEventAbiParams } from "../types/abi.types";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import type { OmnibusCallEvent } from "./omnibus";

interface CustomEventArgCheck<$ArgType> {
  (arg: $ArgType): void;
}

type PartialArray<T extends readonly unknown[]> = T extends readonly [infer A, ...infer Tail]
  ? [A | CustomEventArgCheck<A> | null, ...PartialArray<Tail>]
  : T extends readonly []
    ? []
    : (T[number] | CustomEventArgCheck<T[number]> | null)[];

export function event<$Contract extends Contract, $EventName extends FilterAbiEvents<$Contract["abi"]>["name"]>(
  contract: $Contract,
  eventName: $EventName,
  args: PartialArray<FindEventAbiParams<$Contract["abi"], $EventName>>,
  options: { emitter?: Address; isOptional?: boolean; allowMultiple?: boolean } = {},
): OmnibusCallEvent {
  return {
    // TODO: consider case when contract have overloaded event
    abi: getEventAbi(contract, eventName) as AbiEvent,
    emitter: options.emitter ?? contract.address,
    args: args as unknown[],
    isOptional: options.isOptional ?? false,
    allowMultiple: options.allowMultiple ?? false,
  };
}

export function getSubmittedProposalIds(receipt: TransactionReceipt) {
  const submitProposalLogs = receipt.logs.filter((log) => {
    const proposalSubmittedTopic = encodeEventTopics({ abi: DualGovernance_ABI, eventName: "ProposalSubmitted" })[0];
    return log.topics[0] && bytes.isEqual(log.topics[0], proposalSubmittedTopic);
  });

  return submitProposalLogs.map(
    (log) =>
      decodeEventLog({
        abi: DualGovernance_ABI,
        eventName: "ProposalSubmitted",
        topics: log.topics,
        data: log.data,
      }).args.proposalId,
  );
}

export function assertEventWithLog(actualLog: Log, expectedEvent: OmnibusCallEvent): { skipped: boolean } {
  const [expectedTopic] = encodeEventTopics({ abi: [expectedEvent.abi], eventName: expectedEvent.abi.name });

  if (!bytes.isEqual(actualLog.topics[0]!, expectedTopic)) {
    if (expectedEvent.isOptional) {
      return { skipped: true };
    }
    throw new Error(`Unexpected log for the "${formatAbiItem(expectedEvent.abi)}"`);
  }
  const decodedEvent = decodeEventLog({
    abi: [expectedEvent.abi],
    topics: actualLog.topics,
    data: actualLog.data,
  });

  if (decodedEvent.eventName !== expectedEvent.abi.name) {
    throw new Error(`Event name mismatch`);
  }

  const decodedArgNames = Object.keys(decodedEvent.args ?? {});
  const decodedArgValues = Object.values(decodedEvent.args ?? {});

  if (decodedArgNames.length !== expectedEvent.abi.inputs.length) {
    throw new Error("Unexpected args length");
  }

  for (let k = 0; k < expectedEvent.abi.inputs.length; ++k) {
    if (expectedEvent.args[k] === null) {
      continue;
    }
    const input = expectedEvent.abi.inputs[k];
    const argIndex = decodedArgNames.findIndex((argName) => argName === input.name);
    if (argIndex === -1) {
      throw new Error(`Arg with name "${input.name}" not found`);
    }
    const argValue = decodedArgValues[argIndex];

    const eventArg = expectedEvent.args[k];
    if (eventArg instanceof Function) {
      eventArg(argValue);
    } else {
      const isDeepEqual = bytes.isValid(argValue)
        ? bytes.isEqual(argValue, expectedEvent.args[k] as string)
        : deepEqual(argValue, expectedEvent.args[k], {
            comparator: (leftHandOperand, rightHandOperand) => {
              if (bytes.isValid(leftHandOperand) && bytes.isValid(rightHandOperand)) {
                return bytes.isEqual(leftHandOperand, rightHandOperand);
              }
              return null;
            },
          });
      if (!isDeepEqual) {
        throw new Error(`${formatAbiItem(expectedEvent.abi)} args mismatch: ${argValue} != ${expectedEvent.args[k]}`);
      }
    }
  }
  return { skipped: false };
}

export function formatOmnibusCallEvent(event: OmnibusCallEvent, isSkipped: boolean) {
  const argsStatuses: string[] = [];

  for (let i = 0; i < event.args.length; ++i) {
    const arg = event.args[i];

    const status = isSkipped || arg === null ? chalk.yellow("skipped") : chalk.green("checked");

    argsStatuses.push(`${chalk.gray(event.abi.inputs[i].name)}: ${status}`);
  }

  const eventName = isSkipped ? chalk.yellow(event.abi.name) : chalk.green(event.abi.name);
  const strBuilder: string[] = [eventName, chalk.magenta("("), argsStatuses.join(", "), chalk.magenta(")")];
  return strBuilder.join("");
}
