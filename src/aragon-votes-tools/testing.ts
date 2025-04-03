import type { BigNumberish, ContractTransactionReceipt, Signer } from "ethers";
import providers, { RpcProvider } from "../providers";
import {
  CREATOR,
  CREATOR_ETH_BALANCE,
  CREATOR_LDO_BALANCE,
  DEFAULT_GAS_LIMIT,
  LDO_WHALES,
  VOTE_DURATION,
} from "./constants";
import { start, wait } from "./lifecycle";
import { NonPayableOverrides } from "../../typechain-types/common";
import lido from "../lido";
import { ChainId } from "../common/types";
import { logGreen } from "../common/color";
import { networkIdByName } from "../networks";

export async function creator(provider: RpcProvider): Promise<Signer> {
  const { unlock, lock } = providers.cheats(provider);

  const { ldo } = lido.chainId(await providers.chainId(provider), provider);

  const [creator, creatorLdoBalance] = await Promise.all([
    unlock(CREATOR, CREATOR_ETH_BALANCE),
    ldo.balanceOf(CREATOR),
  ]);

  if (creatorLdoBalance === 0n) {
    const whaleAddress = getLdoWhale(await providers.chainId(provider));
    const whaleBalanceBefore = await provider.getBalance(whaleAddress);
    const whale = await unlock(whaleAddress, 10n * 10n ** 18n);
    await ldo.connect(whale).transfer(CREATOR, CREATOR_LDO_BALANCE);
    await lock(whaleAddress, whaleBalanceBefore);
  }
  return creator;
}

export async function pass(
  provider: RpcProvider,
  voteId: BigNumberish,
  overrides: NonPayableOverrides = { gasLimit: DEFAULT_GAS_LIMIT },
) {
  logGreen(`Passing vote ${voteId}`);
  const chainId = await providers.chainId(provider);
  const { unlock, lock, increaseTime } = providers.cheats(provider);

  const whaleAddress = getLdoWhale(chainId);

  const whaleBalanceBefore = await provider.getBalance(whaleAddress);
  const whale = await unlock(whaleAddress, 10n * 10n ** 18n);

  const { ldo, voting } = lido.chainId(await providers.chainId(provider), whale);

  const vote = await voting.getVote(voteId);
  if (vote.executed) {
    const [log] = await voting.queryFilter(voting.filters["ExecuteVote(uint256)"](voteId));
    if (log === undefined) {
      throw new Error(`ExecuteVote event for voteId "${voteId}" not found`);
    }
    const receipt = await log.getTransactionReceipt();
    if (!receipt) {
      throw new Error(`Receipt for tx ${log.transactionHash} not found`);
    }
    return receipt;
  }

  if (await voting.canVote(voteId, whaleAddress)) {
    await ldo.transfer(CREATOR, CREATOR_LDO_BALANCE);

    await voting.vote(voteId, true, false, overrides);
  }
  await increaseTime(VOTE_DURATION);

  const tx = await voting.executeVote(voteId, overrides);

  await lock(whaleAddress, whaleBalanceBefore);

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("transaction wait failed");
  }
  logGreen(`Enacted vote ${voteId}`);
  return receipt;
}

interface AdoptResult {
  voteId: bigint;
  createReceipt: ContractTransactionReceipt;
  enactReceipt: ContractTransactionReceipt;
}

export async function adopt(
  provider: RpcProvider,
  voteScript: string,
  description: string,
  overrides: NonPayableOverrides = { gasLimit: DEFAULT_GAS_LIMIT },
): Promise<AdoptResult> {
  const { voteId, receipt: createReceipt } = await wait(
    await start(await creator(provider), voteScript, description, false, overrides),
  );
  const enactReceipt = await pass(provider, voteId, overrides);
  return { voteId, createReceipt, enactReceipt: enactReceipt as ContractTransactionReceipt };
}

function getLdoWhale(chainId: ChainId) {
  const chainNumber = Number(chainId);
  if (![networkIdByName.mainnet, networkIdByName.holesky].includes(chainNumber)) {
    throw new Error("Unsupported");
  }
  return LDO_WHALES[chainNumber];
}
