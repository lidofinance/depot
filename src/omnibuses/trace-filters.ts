import { AbiFunction, Address } from "abitype";
import { encodeEventTopics, toFunctionSelector } from "viem";

import bytes from "../common/bytes";
import { Contract, getFunctionAbi } from "../contracts";
import { TxTrace, TxTraceCallItem, TxTraceItem, TxTraceLogItem } from "../traces/tx-traces";
import { CallEvmOpcodes, isCallOpcode, isLogOpcode } from "../traces/evm-opcodes";
import { CallsScript_ABI } from "../../abi/CallsScript.abi";
import { Voting_ABI } from "../../abi/Voting.abi";
import { Executor_ABI } from "../../abi/Executor.abi";
import { EmergencyProtectedTimelock_ABI } from "../../abi/EmergencyProtectedTimelock.abi";
import { getGovernanceContracts } from "./governance-contracts";
import type { BaseOmnibusCall } from "./omnibus";

interface MethodCallConfig {
  type: CallEvmOpcodes;
  address: Address;
  abi: AbiFunction;
}

export function groupOmnibusTraceCalls(items: BaseOmnibusCall[], trace: TxTrace) {
  const voteCallIndices: number[] = [];

  const callTraces: TxTrace[] = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    const startIndex = trace.calls.findIndex(
      (opCode) =>
        (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
        bytes.isEqual(opCode.address, item.getTarget()) &&
        bytes.isEqual(opCode.input, item.getCalldata()),
    );
    voteCallIndices.push(startIndex);
  }

  for (let ind = 0; ind < voteCallIndices.length; ++ind) {
    callTraces.push(trace.slice(voteCallIndices[ind], voteCallIndices[ind + 1]));
  }

  if (items.length !== callTraces.length) {
    throw new Error("Unexpected call traces length");
  }
  const extraCallsTrace = voteCallIndices.length > 0 ? trace.slice(0, voteCallIndices[0]) : null;
  return [extraCallsTrace, callTraces] as const;
}

export function filterOmnibusTrace(trace: TxTrace) {
  const contracts = getGovernanceContracts(trace.network);

  return trace
    .filter(omitProxyDelegateCalls())
    .filter(
      omitViewMethodCalls([
        contracts.locator,
        contracts.kernel,
        contracts.evmScriptRegistry,
        contracts.acl,
        contracts.ldo,
      ]),
    )
    .filter(
      omitMethodCalls([
        {
          type: "DELEGATECALL",
          address: contracts.callsScript.address,
          abi: getFunctionAbi(contracts.callsScript, "execScript"),
        },
      ]),
    )
    .filter(omitStaticCalls())
    .filter(omitAragonServiceLogs())
    .filter(omitDualGovernanceServiceLogs());
}

function omitViewMethodCalls(contracts: Contract[]) {
  return (traceItem: TxTraceItem) => {
    if (!isCallOpcode(traceItem.type)) return true;

    for (const { abi, address } of contracts) {
      if (!bytes.isEqual(traceItem.address, address)) {
        continue;
      }

      const viewAndPureAbiItems = abi.filter(
        (abiItem) =>
          abiItem.type === "function" && (abiItem.stateMutability === "pure" || abiItem.stateMutability === "view"),
      );

      const isSomeMatch = viewAndPureAbiItems.some((abiItem) =>
        bytes.isEqual(
          toFunctionSelector(abiItem as AbiFunction),
          bytes.slice((traceItem as TxTraceCallItem).input, 0, 4),
        ),
      );
      if (isSomeMatch) {
        return false;
      }
    }

    return true;
  };
}

function omitStaticCalls() {
  return (opCode: TxTraceItem) => {
    return opCode.type !== "STATICCALL";
  };
}

function omitProxyDelegateCalls() {
  return (txTraceItem: TxTraceItem, i: number, txTraceItems: TxTraceItem[]) => {
    if (txTraceItem.type !== "DELEGATECALL") return true;

    let parentCallIndex = i - 1;
    while (parentCallIndex >= 0) {
      const prevCall = txTraceItems[parentCallIndex];
      if (prevCall.depth < txTraceItem.depth - 1) {
        parentCallIndex = -1;
        break;
      }
      if ((prevCall.type === "CALL" || prevCall.type === "STATICCALL") && prevCall.depth === txTraceItem.depth - 1) {
        break;
      }
      parentCallIndex -= 1;
    }

    if (parentCallIndex < 0) return true;

    const parentTraceItem = txTraceItems[parentCallIndex];
    if (parentTraceItem.type !== "CALL" && parentTraceItem.type !== "STATICCALL") return true;
    return txTraceItem.input !== parentTraceItem.input && txTraceItem.output === parentTraceItem.output;
  };
}

function omitMethodCalls(callsToOmit: MethodCallConfig[]) {
  return (txTraceItem: TxTraceItem) => {
    if (!isCallOpcode(txTraceItem.type)) {
      return true;
    }

    return !callsToOmit.some((call) => {
      return (
        call.type === txTraceItem.type &&
        bytes.isEqual(call.address, txTraceItem.address ?? "0x") &&
        bytes.isEqual(toFunctionSelector(call.abi), bytes.slice(txTraceItem.input, 0, 4))
      );
    });
  };
}

function omitAragonServiceLogs() {
  return (txTraceItem: TxTraceItem) => {
    if (!isLogOpcode(txTraceItem.type)) return true;

    const { topics } = txTraceItem as TxTraceLogItem;

    if (topics.length === 0) return true;

    const logScriptCallTopics = encodeEventTopics({ abi: CallsScript_ABI, eventName: "LogScriptCall" });
    const scriptResultTopics = encodeEventTopics({ abi: Voting_ABI, eventName: "ScriptResult" });
    const executeVoteTopics = encodeEventTopics({ abi: Voting_ABI, eventName: "ExecuteVote" });

    return bytes.isEqual(topics[0], logScriptCallTopics[0]) ||
      bytes.isEqual(topics[0], scriptResultTopics[0]) ||
      bytes.isEqual(topics[0], executeVoteTopics[0])
      ? false
      : true;
  };
}

function omitDualGovernanceServiceLogs() {
  return (txTraceItem: TxTraceItem) => {
    if (!isLogOpcode(txTraceItem.type)) return true;

    const { topics } = txTraceItem as TxTraceLogItem;

    if (topics.length === 0) return true;

    const executedTopics = encodeEventTopics({ abi: Executor_ABI, eventName: "Executed" });
    const proposalExecutedTopics = encodeEventTopics({
      abi: EmergencyProtectedTimelock_ABI,
      eventName: "ProposalExecuted",
    });

    return bytes.isEqual(topics[0], executedTopics[0]) || bytes.isEqual(topics[0], proposalExecutedTopics[0])
      ? false
      : true;
  };
}
