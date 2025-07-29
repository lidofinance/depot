import { Address, decodeEventLog, encodeEventTopics, Log, TransactionReceipt } from "viem";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import { CheckContext } from "./checks";
import deepEqual from "deep-eql";
import { ContractEvent, Omnibus } from "../omnibus";
import { NetworkName } from "../../network";
import { EmergencyProtectedTimelock_ABI } from "../../../abi/EmergencyProtectedTimelock.abi";
import { Executor_ABI } from "../../../abi/Executor.abi";
import { Contract, getLidoContracts } from "../../contracts/contracts";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-proposal-call";
import { Voting_ABI } from "../../../abi/Voting.abi";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";

function doesTopic0Match(log: Log, topic: HexStrPrefixed, address: Address) {
  return bytes.isEqual(log.address, address) && !!log.topics[0] && bytes.isEqual(log.topics[0], topic);
}

export function groupOmnibusLogs(voting: Contract<typeof Voting_ABI>, logs: Log[]) {
  if (logs.length < 2) {
    throw new Error("Invalid logs length");
  }

  const [executeVoteTopic0] = encodeEventTopics({ abi: voting.abi, eventName: "ExecuteVote" });
  const [scriptResultTopic0] = encodeEventTopics({ abi: voting.abi, eventName: "ScriptResult" });
  const [logScriptCallTopic0] = encodeEventTopics({ abi: CallsScript_ABI, eventName: "LogScriptCall" });

  // Validate "service" Voting events are in the log
  const [scriptResultLog, executeVoteLog] = logs.slice(logs.length - 2);

  if (!doesTopic0Match(scriptResultLog, scriptResultTopic0, voting.address)) {
    throw new Error("ScriptResult log not found");
  }

  if (!doesTopic0Match(executeVoteLog, executeVoteTopic0, voting.address)) {
    throw new Error("ExecuteVote log not found");
  }

  const logsGroups: Log[][] = [];
  let currentGroup: Log[] = [];

  for (const log of logs.slice(0, -2)) {
    const isStartOfNewGroup = doesTopic0Match(log, logScriptCallTopic0, voting.address);

    if (isStartOfNewGroup) {
      currentGroup = [];
      logsGroups.push(currentGroup);
    }

    currentGroup.push(log);
  }

  return logsGroups;
}

export function checkOmnibusLogsGroup(logsGroup: Log[], events: ContractEvent[]) {
  const eventsCount = events.length;
  const requiredEventsCount = events.filter((e) => !e.isOptional).length;

  if (eventsCount === requiredEventsCount) {
    if (logsGroup.length !== eventsCount) {
      throw new Error(`Invalid logs group length: ${logsGroup.length} !== ${events.length}`);
    }
  } else {
    if (logsGroup.length < requiredEventsCount || logsGroup.length > eventsCount) {
      throw new Error(
        `Invalid logs group length: ${logsGroup.length} out of allowed range: [${requiredEventsCount}, ${eventsCount}]`,
      );
    }
  }

  let logIndex = 0;
  for (let i = 0; i < eventsCount; ++i) {
    const log = logsGroup[logIndex];
    const event = events[i];

    const [expectedTopic] = encodeEventTopics({ abi: [event.abi], eventName: event.abi.name });

    if (!doesTopic0Match(log, expectedTopic, event.emitter)) {
      if (event.isOptional) {
        continue;
      }
      throw new Error(`Unexpected event: topic ${log.topics[0]} doesn't match event "${event.abi.name}"`);
    }
    const decodedEvent = decodeEventLog({ abi: [event.abi], topics: log.topics, data: log.data });

    if (decodedEvent.eventName !== event.abi.name) {
      throw new Error(`Decoded event name mismatch: ${decodedEvent.eventName} !== ${event.abi.name}`);
    }

    const decodedArgNames = Object.keys(decodedEvent.args);
    const decodedArgValues = Object.values(decodedEvent.args);

    if (decodedArgNames.length !== event.abi.inputs.length) {
      throw new Error(`Unexpected event args length: ${decodedArgNames.length} !== ${event.abi.inputs.length}`);
    }

    for (let j = 0; j < event.abi.inputs.length; ++j) {
      if (event.args[j] === null) {
        continue;
      }
      const input = event.abi.inputs[j];
      const argIndex = decodedArgNames.findIndex((argName) => argName === input.name);
      if (argIndex === -1) {
        throw new Error(`Arg with name "${input.name}" not found`);
      }
      const argValue = decodedArgValues[argIndex];

      const isDeepEqual = bytes.isValid(argValue)
        ? bytes.isEqual(argValue, event.args[j] as string)
        : deepEqual(argValue, event.args[j], {
            comparator: (leftHandOperand, rightHandOperand) => {
              if (bytes.isValid(leftHandOperand) && bytes.isValid(rightHandOperand)) {
                return bytes.isEqual(leftHandOperand, rightHandOperand);
              }
              return null;
            },
          });
      if (!isDeepEqual) {
        throw new Error(`Event arg[${j}] mismatch: ${argValue} != ${event.args[j]}`);
      }
    }

    ++logIndex;
  }

  if (logIndex !== logsGroup.length) {
    throw new Error("Unchecked log items in the group");
  }
}

function checkOmnibusEvents({ contracts }: CheckContext, omnibus: Omnibus, enactReceipt: TransactionReceipt) {
  const logsGroups = groupOmnibusLogs(contracts.voting, enactReceipt.logs);

  if (omnibus.events.length !== logsGroups.length) {
    throw new Error("Unexpected vote items count");
  }

  for (let i = 0; i < logsGroups.length; ++i) {
    checkOmnibusLogsGroup(logsGroups[i], omnibus.events[i]);
  }
}

export function checkProposalExecutionLogsGroup(logsGroup: Log[], events: ContractEvent[]) {
  const eventsCount = events.length;
  const requiredEventsCount = events.filter((e) => !e.isOptional).length;

  if (eventsCount === requiredEventsCount) {
    if (logsGroup.length !== eventsCount + 1) {
      throw new Error(`Invalid logs group length: ${logsGroup.length} !== ${events.length}`);
    }
  } else {
    if (logsGroup.length < requiredEventsCount || logsGroup.length > eventsCount + 1) {
      throw new Error(
        `Invalid logs group length: ${logsGroup.length} out of allowed range: [${requiredEventsCount}, ${eventsCount}]`,
      );
    }
  }

  let logIndex = 0;
  for (let expectedEventIndex = 0; expectedEventIndex < events.length; ++expectedEventIndex) {
    const actualLog = logsGroup[logIndex];
    const expectedEvent = events[expectedEventIndex];

    const [expectedTopic] = encodeEventTopics({ abi: [expectedEvent.abi], eventName: expectedEvent.abi.name });

    if (!bytes.isEqual(actualLog.topics[0]!, expectedTopic)) {
      if (expectedEvent.isOptional) {
        continue;
      }
      throw new Error(`Unexpected event topic in the logs `);
    }
    const decodedEvent = decodeEventLog({
      abi: [expectedEvent.abi],
      topics: actualLog.topics,
      data: actualLog.data,
    });

    if (decodedEvent.eventName !== expectedEvent.abi.name) {
      throw new Error(`Event name mismatch`);
    }

    const decodedArgNames = Object.keys(decodedEvent.args);
    const decodedArgValues = Object.values(decodedEvent.args);

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
        throw new Error(`Event args mismatch: ${argValue} != ${expectedEvent.args[k]}`);
      }
    }

    ++logIndex;
  }

  if (logIndex !== logsGroup.length - 1) {
    // TODO: the last event to check in the log is  LOG2 Executed(address,uint256,bytes,bytes)
    throw new Error("Unchecked log items in the group");
  }
}

function checkProposalExecutionEvents(
  { client }: CheckContext,
  omnibus: Omnibus,
  executeReceipts: TransactionReceipt[],
) {
  const submitProposalCalls = omnibus.calls.filter((item) => item instanceof OmnibusSubmitProposalCall);

  if (submitProposalCalls.length !== executeReceipts.length) {
    throw new Error("Invalid length");
  }

  for (let i = 0; i < submitProposalCalls.length; ++i) {
    const call = submitProposalCalls[i];
    const receipt = executeReceipts[i];

    const groupedExecuteLogs = groupProposalExecutionLogs(client.getNetworkName(), receipt);

    if (call.calls.length !== groupedExecuteLogs.length) {
      throw new Error("Unexpected calls length");
    }

    for (let j = 0; j < call.calls.length; ++j) {
      const { events: expectedEvents } = call.calls[j];
      const actualLogsGroup = groupedExecuteLogs[j];

      // TODO: fix for optional events
      if (call.calls.length !== groupedExecuteLogs.length) {
        throw new Error("Unexpected events length");
      }

      let logIndex = 0;
      for (let expectedEventIndex = 0; expectedEventIndex < expectedEvents.length; ++expectedEventIndex) {
        const actualLog = actualLogsGroup[logIndex];
        const expectedEvent = expectedEvents[expectedEventIndex];

        const [expectedTopic] = encodeEventTopics({ abi: [expectedEvent.abi], eventName: expectedEvent.abi.name });

        if (!bytes.isEqual(actualLog.topics[0]!, expectedTopic)) {
          if (expectedEvent.isOptional) {
            continue;
          }
          throw new Error(
            `Unexpected event topic in the logs logsGroupIndex = ${i}, eventIndex = ${expectedEventIndex}, logIndex = ${logIndex}`,
          );
        }
        const decodedEvent = decodeEventLog({
          abi: [expectedEvent.abi],
          topics: actualLog.topics,
          data: actualLog.data,
        });

        if (decodedEvent.eventName !== expectedEvent.abi.name) {
          throw new Error(`Event name mismatch`);
        }

        const decodedArgNames = Object.keys(decodedEvent.args);
        const decodedArgValues = Object.values(decodedEvent.args);

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
            throw new Error(`Event args mismatch: ${argValue} != ${expectedEvent.args[k]}`);
          }
        }

        ++logIndex;
      }

      if (logIndex !== actualLogsGroup.length - 1) {
        // TODO: the last event to check in the log is  LOG2 Executed(address,uint256,bytes,bytes)
        throw new Error("Unchecked log items in the group");
      }
    }
  }
}

export function groupProposalExecutionLogs(network: NetworkName, executeReceipt: TransactionReceipt) {
  const logs = executeReceipt.logs;

  if (logs.length < 1) {
    throw new Error("Invalid logs length");
  }

  const [proposalExecuteTopic0] = encodeEventTopics({
    abi: EmergencyProtectedTimelock_ABI,
    eventName: "ProposalExecuted",
  });
  const [executedTopic0] = encodeEventTopics({ abi: Executor_ABI, eventName: "Executed" });

  // Validate "service" Timelock event are in the log
  if (!bytes.isEqual(logs[logs.length - 1].topics[0]!, proposalExecuteTopic0)) {
    throw new Error("ExecuteVote log not found");
  }

  const logsGroups: Log[][] = [];
  let currentGroup: Log[] = [];

  const { adminExecutor } = getLidoContracts(network);
  for (const log of logs.slice(0, -1)) {
    currentGroup.push(log);

    const isStartOfNewGroup = log.topics[0] === executedTopic0 && log.address === adminExecutor.address;
    if (isStartOfNewGroup) {
      logsGroups.push(currentGroup);
      currentGroup = [];
    }
  }
  if (logsGroups[logsGroups.length - 1].length === 0) {
    return logsGroups.slice(0, -1);
  }
  return logsGroups;
}

export default {
  groupOmnibusLogs,
  checkOmnibusLogsGroup,
  checkOmnibusEvents,
  checkProposalExecutionEvents,
};
