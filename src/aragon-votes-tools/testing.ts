import { CREATOR, CREATOR_ETH_BALANCE, CREATOR_LDO_BALANCE, LDO_WHALES_BY_NETWORK_NAME } from "./constants";
import { startAragonVote } from "./lifecycle";
import { NetworkName, DevRpcClient } from "../network";
import { Address, TransactionReceipt } from "viem";
import { HexStrPrefixed } from "../common/bytes";
import { getLidoContracts } from "../contracts/contracts";
import { createTimedSpinner } from "../common/spinner";

export async function setupLdoHolder(client: DevRpcClient, account: Address = CREATOR) {
  const network = client.getNetworkName();

  const { ldo } = getLidoContracts(network);

  if ((await client.read(ldo, "balanceOf", [account])) === CREATOR_ETH_BALANCE) {
    return account;
  }

  const creatorLdoBalance = await client.read(ldo, "balanceOf", [account]);
  if (creatorLdoBalance === 0n) {
    const whaleAddress = getLdoWhale(network);
    const whaleBalanceBefore = await client.getBalance(whaleAddress);
    await client.impersonate(whaleAddress, 10n ** 18n);
    await client.write(ldo, "transfer", [account, CREATOR_LDO_BALANCE], { from: whaleAddress });
    await client.stopImpersonating(whaleAddress, whaleBalanceBefore);
  }

  await client.impersonate(account, CREATOR_ETH_BALANCE);
  return account;
}

export async function passAragonVote(client: DevRpcClient, voteId: bigint) {
  const spinner = createTimedSpinner(`Passing vote with id ${voteId}`);
  const network = client.getNetworkName();

  const { voting } = getLidoContracts(network);

  const [, executed] = await client.read(voting, "getVote", [voteId]);

  if (executed) {
    spinner.succeed(`Vote with id ${voteId} already executed`);
    const [log] = await client.viemClient.getContractEvents({ ...voting, eventName: "ExecuteVote", args: { voteId } });
    if (log === undefined) {
      throw new Error(`ExecuteVote event for voteId "${voteId}" not found`);
    }
    return client.viemClient.getTransactionReceipt({ hash: log.transactionHash });
  }

  const whaleAddress = getLdoWhale(network);

  const whaleBalanceBefore = await client.getBalance(whaleAddress);
  await client.impersonate(whaleAddress, 10n * 10n ** 18n);

  if (await client.read(voting, "canVote", [voteId, whaleAddress])) {
    await client.write(voting, "vote", [voteId, true, false], { from: whaleAddress });
  } else {
    throw new Error("Can not vote");
  }
  const voteDuration = await client.read(voting, "voteTime", []);
  await client.increaseTime(voteDuration);

  const receipt = await client.write(voting, "executeVote", [voteId], { from: whaleAddress });

  await client.stopImpersonating(whaleAddress, whaleBalanceBefore);

  spinner.succeed(`Vote with id ${voteId} successfully executed`);
  return receipt;
}

interface AdoptResult {
  voteId: bigint;
  createVoteReceipt: TransactionReceipt;
  executeVoteReceipt: TransactionReceipt;
}

export async function adoptAragonVoting(
  client: DevRpcClient,
  evmScript: HexStrPrefixed,
  description: string,
): Promise<AdoptResult> {
  const ldoHolderAddress = await setupLdoHolder(client);

  const { voteId, receipt: createVoteReceipt } = await startAragonVote(client, evmScript, description, {
    from: ldoHolderAddress,
  });

  const executeVoteReceipt = await passAragonVote(client, voteId);

  return { voteId, createVoteReceipt, executeVoteReceipt };
}

function getLdoWhale(networkName: NetworkName) {
  const whale = LDO_WHALES_BY_NETWORK_NAME[networkName];
  if (!whale) {
    throw new Error("Unsupported chain");
  }
  return whale;
}
