import { decodeFunctionData } from "viem";

import bytes from "../common/bytes";
import { EvmScriptParser } from "../aragon-votes-tools";
import { Agent_ABI } from "../../abi/Agent.abi";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { OmnibusDirectCall } from "./calls/omnibus-direct-call";
import { OmnibusExecuteCall } from "./calls/omnibus-execute-call";
import { OmnibusForwardCall } from "./calls/omnibus-forward-call";
import { OmnibusForwardCalls } from "./calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall } from "./calls/omnibus-submit-calls";
import type { OmnibusCall, VoteCall } from "./omnibus-types";

export function validateVoteCalls(calls: OmnibusCall[], contractVoteCalls: VoteCall[]) {
  if (contractVoteCalls.length !== calls.length) {
    throw new Error(`Unexpected vote calls count`);
  }

  for (let i = 0; i < calls.length; ++i) {
    const omnibusCall = calls[i];
    const voteCall = contractVoteCalls[i];
    if (omnibusCall instanceof OmnibusDirectCall) {
      validateVoteDirectCall(omnibusCall, voteCall);
    } else if (omnibusCall instanceof OmnibusForwardCalls) {
      validateVoteForwardCalls(omnibusCall, voteCall);
    } else if (omnibusCall instanceof OmnibusSubmitProposalCall) {
      validateVoteSubmitCalls(omnibusCall, voteCall);
    } else if (omnibusCall instanceof OmnibusExecuteCall) {
      validateVoteExecuteCall(omnibusCall, voteCall);
    } else {
      throw new Error(`Unexpected omnibus call type`);
    }
  }
}

function validateVoteDirectCall(omnibusCall: OmnibusDirectCall, voteCall: VoteCall) {
  if (!bytes.isEqual(omnibusCall.getTarget(), voteCall.target)) {
    throw new Error(`Omnibus target is not equal`);
  }
  if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
    throw new Error(`Omnibus payload for call "${omnibusCall.title}" is not equal`);
  }
  if (omnibusCall.title !== voteCall.title) {
    throw new Error(`Unexpected title: ${omnibusCall.title} != ${voteCall.title}`);
  }
}

function validateVoteForwardCall(omnibusCall: OmnibusForwardCall, voteCall: VoteCall) {
  if (!bytes.isEqual(omnibusCall.forwarder.address, voteCall.target)) {
    throw new Error(`Invalid forwarder address`);
  }

  const decodedForwardCall = decodeFunctionData({
    abi: Agent_ABI,
    data: voteCall.payload,
  });

  if (decodedForwardCall.functionName !== "forward") {
    throw new Error("Unexpected calldata method");
  }

  const evmScript = decodedForwardCall.args[0];

  const forwardedCall = omnibusCall.call;
  const { calls: evmScriptCalls } = EvmScriptParser.decode(evmScript);

  if (evmScriptCalls.length !== 1) {
    throw new Error(`Unexpected calls length`);
  }

  if (forwardedCall.title !== voteCall.title) {
    throw new Error(`Unexpected title: ${forwardedCall.title} != ${voteCall.title}`);
  }

  validateVoteDirectCall(forwardedCall, {
    title: forwardedCall.title,
    payload: evmScriptCalls[0].calldata,
    target: evmScriptCalls[0].address,
  });

  if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
    throw new Error(`Invalid calldata`);
  }
}

function validateVoteForwardCalls(omnibusCall: OmnibusForwardCalls, voteCall: VoteCall) {
  if (!bytes.isEqual(omnibusCall.forwarder.address, voteCall.target)) {
    throw new Error(`Invalid forwarder address`);
  }

  const decodedForwardCall = decodeFunctionData({
    abi: Agent_ABI,
    data: voteCall.payload,
  });

  if (decodedForwardCall.functionName !== "forward") {
    throw new Error("Unexpected calldata method");
  }

  const evmScript = decodedForwardCall.args[0];

  const forwardedCalls = omnibusCall.forwardedCalls;
  const { calls: evmScriptCalls } = EvmScriptParser.decode(evmScript);

  if (forwardedCalls.length !== evmScriptCalls.length) {
    throw new Error(`Unexpected calls length`);
  }

  const [forwardCallTitle, ...callTitles] = voteCall.title.split("\n").map((t) => t.trim());

  if (omnibusCall.title !== forwardCallTitle) {
    throw new Error(`Unexpected title: ${omnibusCall.title} != ${forwardCallTitle}`);
  }

  if (callTitles.length !== omnibusCall.forwardedCalls.length) {
    throw new Error(`Unexpected titles count`);
  }

  for (let i = 0; i < evmScriptCalls.length; ++i) {
    validateVoteDirectCall(omnibusCall.forwardedCalls[i], {
      title: callTitles[i],
      payload: evmScriptCalls[i].calldata,
      target: evmScriptCalls[i].address,
    });
  }

  if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
    throw new Error(`Invalid calldata`);
  }
}

function validateVoteExecuteCall(omnibusCall: OmnibusExecuteCall, voteCall: VoteCall) {
  if (!bytes.isEqual(omnibusCall.executor.address, voteCall.target)) {
    throw new Error(`Invalid forwarder address`);
  }

  const decodedForwardCall = decodeFunctionData({
    abi: Agent_ABI,
    data: voteCall.payload,
  });

  if (decodedForwardCall.functionName !== "execute") {
    throw new Error("Unexpected calldata method");
  }

  if (!bytes.isEqual(omnibusCall.call.getTarget(), decodedForwardCall.args[0])) {
    throw new Error(`Invalid execute call target`);
  }

  if (omnibusCall.getValue() !== decodedForwardCall.args[1]) {
    throw new Error(`Invalid execute call value`);
  }

  if (!bytes.isEqual(omnibusCall.call.getCalldata(), decodedForwardCall.args[2])) {
    throw new Error(`Invalid execute call payload`);
  }

  if (omnibusCall.call.title !== voteCall.title) {
    throw new Error(`Invalid execute call title`);
  }
}

function validateVoteSubmitCalls(omnibusCall: OmnibusSubmitProposalCall, voteCall: VoteCall) {
  if (!bytes.isEqual(omnibusCall.governance.address, voteCall.target)) {
    throw new Error(`Invalid forwarder address`);
  }

  const decodedSubmitProposalCall = decodeFunctionData({
    abi: DualGovernance_ABI,
    data: voteCall.payload,
  });

  if (decodedSubmitProposalCall.functionName !== "submitProposal") {
    throw new Error("Unexpected calldata method");
  }

  const [proposalCalls, description] = decodedSubmitProposalCall.args;

  const [submitCallTitle, ...callsTitles] = description.split("\n").map((desc) => desc.trim());

  if (submitCallTitle !== omnibusCall.title) {
    throw new Error(`Unexpected titles: expected "${submitCallTitle}", actual "${omnibusCall.title}"`);
  }

  if (proposalCalls.length !== omnibusCall.calls.length) {
    throw new Error(`Unexpected number of calls`);
  }

  let descLineStartIndex = 0;
  for (let i = 0; i < proposalCalls.length; ++i) {
    const call = omnibusCall.calls[i];
    const proposalCall = proposalCalls[i];

    if (call instanceof OmnibusDirectCall ? call.getValue() : 0n !== proposalCall.value) {
      throw new Error(`Unexpected value`);
    }

    if (call instanceof OmnibusDirectCall) {
      validateVoteDirectCall(call, {
        target: proposalCall.target,
        payload: proposalCall.payload,
        title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
      });
    } else if (call instanceof OmnibusForwardCalls) {
      validateVoteForwardCalls(call, {
        target: proposalCall.target,
        payload: proposalCall.payload,
        title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += call.forwardedCalls.length + 1)).join("\n"),
      });
    } else if (call instanceof OmnibusExecuteCall) {
      validateVoteExecuteCall(call, {
        target: proposalCall.target,
        payload: proposalCall.payload,
        title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
      });
    } else if (call instanceof OmnibusForwardCall) {
      validateVoteForwardCall(call, {
        target: proposalCall.target,
        payload: proposalCall.payload,
        title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
      });
    } else {
      throw new Error("Unexpected call type");
    }
  }

  if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
    throw new Error(`Invalid calldata: ${omnibusCall.getCalldata()} != ${voteCall.payload}`);
  }
}
