import { TransactionReceipt } from "viem";

import { getExecuteReceipt } from "../aragon-votes-tools/lifecycle";
import { HexStrPrefixed } from "../common/bytes";
import { KnownError } from "../common/errors";
import { RpcClient } from "../network";
import { ProposalStatus } from "./dual-governance";
import { getSubmittedProposalIds } from "./event-helpers";
import { getGovernanceContracts } from "./governance-contracts";

export interface VoteState {
  open: boolean;
  executed: boolean;
  canExecute: boolean;
  snapshotBlock: bigint;
  script: HexStrPrefixed;
}

export interface VoteExecution {
  executeReceipt: TransactionReceipt;
  proposals: { id: bigint; status: ProposalStatus }[];
}

export async function readVoteState(client: RpcClient, voteId: bigint): Promise<VoteState> {
  const { voting } = getGovernanceContracts(client.getNetworkName());
  const votesLength = await client.read(voting, "votesLength", []);
  if (votesLength <= voteId) {
    const blockNumber = await client.getBlockNumber();
    throw new KnownError(
      `Vote ${voteId} does not exist at block ${blockNumber} (votesLength is ${votesLength}); check voteId or the fork block`,
    );
  }
  const [[open, executed, , snapshotBlock, , , , , , script], canExecute] = await Promise.all([
    client.read(voting, "getVote", [voteId]),
    client.read(voting, "canExecute", [voteId]),
  ]);
  return { open, executed, canExecute, snapshotBlock, script };
}

/** `fromBlock` bounds the ExecuteVote log search; the vote snapshot block is the natural one. */
export async function readVoteExecution(client: RpcClient, voteId: bigint, fromBlock: bigint): Promise<VoteExecution> {
  const { timelock } = getGovernanceContracts(client.getNetworkName());
  const executeReceipt = await getExecuteReceipt(client, voteId, fromBlock);
  const proposalIds = getSubmittedProposalIds(executeReceipt);
  const details = await Promise.all(proposalIds.map((id) => client.read(timelock, "getProposalDetails", [id])));
  return {
    executeReceipt,
    proposals: proposalIds.map((id, index) => ({ id, status: details[index].status })),
  };
}
