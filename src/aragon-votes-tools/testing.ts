import { CREATOR, CREATOR_ETH_BALANCE, CREATOR_LDO_BALANCE, LDO_VOTERS_BY_NETWORK_NAME } from "./constants";
import { DevRpcClient } from "../network";
import { Address, formatEther, TransactionReceipt } from "viem";
import { getGovernanceContracts } from "../omnibuses/governance-contracts";

const MAIN_VOTE_PHASE = 0;

export async function setupLdoHolder(client: DevRpcClient, account: Address = CREATOR): Promise<Address> {
  const network = client.getNetworkName();
  const { ldo } = getGovernanceContracts(network);
  const [funder] = LDO_VOTERS_BY_NETWORK_NAME[network];

  await withImpersonatedAccount(client, funder, CREATOR_ETH_BALANCE, async () => {
    await client.write(ldo, "transfer", [account, CREATOR_LDO_BALANCE], { from: funder });
  });

  await client.impersonate(account, CREATOR_ETH_BALANCE);
  return account;
}

export async function passAragonVote(client: DevRpcClient, voteId: bigint): Promise<TransactionReceipt> {
  const network = client.getNetworkName();
  const { voting } = getGovernanceContracts(network);
  const voters = LDO_VOTERS_BY_NETWORK_NAME[network];
  const [[, executed], phase] = await Promise.all([
    client.read(voting, "getVote", [voteId]),
    client.read(voting, "getVotePhase", [voteId]),
  ]);

  if (executed) {
    throw new Error(`Vote ${voteId} is already executed, there is nothing to pass`);
  }

  // the objection phase takes only "nay": a "yea" reverts with VOTING_CAN_NOT_VOTE
  if (phase === MAIN_VOTE_PHASE) {
    for (const voter of voters) {
      if (!(await client.read(voting, "canVote", [voteId, voter]))) {
        continue;
      }

      await withImpersonatedAccount(client, voter, CREATOR_ETH_BALANCE, async () => {
        await client.write(voting, "vote", [voteId, true, false], { from: voter });
      });
    }
  }

  const voteDuration = await client.read(voting, "voteTime", []);
  await client.advanceTime(voteDuration);

  const [vote, pctBase, canExecute] = await Promise.all([
    client.read(voting, "getVote", [voteId]),
    client.read(voting, "PCT_BASE", []),
    client.read(voting, "canExecute", [voteId]),
  ]);
  const [, , , , , minAcceptQuorum, yea, nay, votingPower] = vote;
  const quorumThreshold = (votingPower * minAcceptQuorum) / pctBase;
  console.log(
    [
      `Vote ${voteId} diagnostics before execution:`,
      `    - yea: ${formatEther(yea)} LDO`,
      `    - nay: ${formatEther(nay)} LDO`,
      `    - quorum: > ${formatEther(quorumThreshold)} LDO`,
      `    - voting power: ${formatEther(votingPower)} LDO`,
      `    - canExecute: ${canExecute}`,
    ].join("\n"),
  );

  if (!canExecute) {
    throw new Error(`Vote ${voteId} cannot be executed after its vote time, see the diagnostics above`);
  }

  return withImpersonatedAccount(client, voters[0], CREATOR_ETH_BALANCE, () =>
    client.write(voting, "executeVote", [voteId], { from: voters[0] }),
  );
}

async function withImpersonatedAccount<T>(
  client: DevRpcClient,
  account: Address,
  balance: bigint,
  callback: () => Promise<T>,
): Promise<T> {
  const originalBalance = await client.getBalance(account);
  await client.impersonate(account, balance);
  try {
    return await callback();
  } finally {
    await client.stopImpersonating(account, originalBalance);
  }
}
