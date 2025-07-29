import { AbiFunction, Address, decodeEventLog, encodeEventTopics, toFunctionSelector, TransactionReceipt } from "viem";
import { adoptAragonVoting } from "../../aragon-votes-tools/testing";
import { DevRpcClient } from "../../network";
import { trace } from "../../traces";
import { DualGovernance_ABI } from "../../../abi/DualGovernance.abi";
import { TxTrace, TxTraceCallItem, TxTraceItem, TxTraceLogItem } from "../../traces/tx-traces";
import bytes from "../../common/bytes";
import { groupOmnibusTraceCalls, Omnibus } from "../omnibus";
import { CallEvmOpcodes, isCallOpcode, isLogOpcode } from "../../traces/evm-opcodes";
import { Contract, getFunctionAbi, getLidoContracts, getLidoImpls } from "../../contracts/contracts";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";
import { Voting_ABI } from "../../../abi/Voting.abi";
import { Executor_ABI } from "../../../abi/Executor.abi";
import { EmergencyProtectedTimelock_ABI } from "../../../abi/EmergencyProtectedTimelock.abi";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-proposal-call";
import { createTimedSpinner } from "../../common/spinner";
import { processPendingProposals } from "../dual-governance";

export async function dryRunOmnibus(client: DevRpcClient, omnibus: Omnibus): Promise<void> {
  if (omnibus.network !== client.getNetworkName()) {
    throw new Error(
      `Invalid network: Omnibus network is "${omnibus.network}" but RPC connected to "${client.getNetworkName()}"`,
    );
  }

  const snapshotId = await client.snapshot();
  try {
    const { executeVoteReceipt, voteId } = await adoptAragonVoting(client, omnibus.script, omnibus.description);

    let spinner = createTimedSpinner(`Retrieving trace for execution of vote ${voteId}...`);
    const fullTrace = await trace(client, executeVoteReceipt.transactionHash);
    spinner.succeed(`Trace successfully received`);

    const executeVoteTrace = filterOmnibusTrace(fullTrace);

    const submitProposalLogs = executeVoteReceipt.logs.filter((log) => {
      const proposalSubmittedTopic = encodeEventTopics({ abi: DualGovernance_ABI, eventName: "ProposalSubmitted" })[0];
      return log.topics[0] === proposalSubmittedTopic;
    });

    const submittedProposalIds: bigint[] = submitProposalLogs.map(
      (log) =>
        decodeEventLog({
          abi: DualGovernance_ABI,
          eventName: "ProposalSubmitted",
          topics: log.topics,
          data: log.data,
        }).args.proposalId,
    );

    let executeProposalReceipts: TransactionReceipt[] = [];
    let traces: TxTrace[] = [];
    if (submittedProposalIds.length > 0) {
      spinner = createTimedSpinner(`Process pending DG proposals...`);
      executeProposalReceipts = await processPendingProposals(client, submittedProposalIds);
      spinner.succeed(`Pending DG proposals "${submittedProposalIds}" successfully executed.`);

      if (executeProposalReceipts.length !== submittedProposalIds.length) {
        throw new Error("Invalid proposal receipts count");
      }

      spinner = createTimedSpinner(`Retrieving traces for executed DG proposals...`);
      traces = await Promise.all(executeProposalReceipts.map((receipt) => trace(client, receipt.transactionHash)));
      spinner.succeed(`Traces successfully received`);
    }

    console.log(
      formatOmnibus(omnibus, {
        executeOmnibusTrace: executeVoteTrace,
        executeProposalTraces: traces.map(filterOmnibusTrace),
      }),
    );
  } catch (error) {
    console.error("Dry Run failed with error:", error);
  } finally {
    await client.revert(snapshotId);
  }
}

interface FormatOmnibusParams {
  executeOmnibusTrace?: TxTrace;
  executeProposalTraces?: TxTrace[];
}

export function formatOmnibus(
  omnibus: Omnibus,
  { executeOmnibusTrace, executeProposalTraces = [] }: FormatOmnibusParams = {},
) {
  const strBuilder: string[] = [];
  const callTraces = executeOmnibusTrace ? groupOmnibusTraceCalls(omnibus.calls, executeOmnibusTrace) : [];

  let executeProposalTraceIndex = 0;
  for (let i = 0; i < omnibus.calls.length; ++i) {
    const callIndex = `${i + 1}`;
    const callTrace = callTraces[i];
    const omnibusCall = omnibus.calls[i];

    if (omnibusCall instanceof OmnibusSubmitProposalCall) {
      strBuilder.push(omnibusCall.format(callIndex, executeProposalTraces[executeProposalTraceIndex]));
      executeProposalTraceIndex += 1;
    } else {
      strBuilder.push(omnibusCall.format(callIndex, callTrace));
    }
    strBuilder.push("");
  }
  return strBuilder.join("\n");
}

interface MethodCallConfig {
  type: CallEvmOpcodes;
  address: Address;
  abi: AbiFunction;
}

export function filterOmnibusTrace(trace: TxTrace) {
  const impls = getLidoImpls(trace.network);
  const contracts = getLidoContracts(trace.network);

  return trace
    .filter(
      omitViewMethodCalls([
        contracts.lidoLocator,
        impls.lidoLocator,
        contracts.kernel,
        impls.kernel,
        contracts.evmScriptRegistry,
        impls.evmScriptRegistry,
        contracts.acl,
        impls.acl,
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
    .filter(omitProxyDelegateCalls())
    .filter(omitStaticCalls())
    .filter(omitAragonServiceLogs())
    .filter(omitDualGovernanceServiceLogs());
}

function omitViewMethodCalls(contracts: Contract[]) {
  return (traceItem: TxTraceItem) => {
    if (!isCallOpcode(traceItem.type)) return true;

    for (const { abi, address, label } of contracts) {
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
