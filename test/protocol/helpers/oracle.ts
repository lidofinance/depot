import { assert } from "chai";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  keccak256,
  parseAbi,
  parseEther,
  zeroHash,
  type Address,
  type CallReturnType,
  type ContractFunctionArgs,
  type ContractFunctionReturnType,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";
import { Burner_ABI } from "@/abi/Burner.abi";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { LidoLocator_ABI } from "@/abi/LidoLocator.abi";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import type { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";

const delegationAbi = parseAbi([
  "function getDelegate() view returns (address)",
  "function execute(address target, bytes data) returns (bytes)",
]);
const accountingAbi = parseAbi([
  "function simulateOracleReport((uint256 timestamp,uint256 timeElapsed,uint256 clValidatorsBalance,uint256 clPendingBalance,uint256 withdrawalVaultBalance,uint256 elRewardsVaultBalance,uint256 sharesRequestedToBurn,uint256[] withdrawalFinalizationBatches,uint256 simulatedShareRate) report) view returns ((uint256 withdrawalsVaultTransfer,uint256 elRewardsVaultTransfer,uint256 etherToFinalizeWQ,uint256 sharesToFinalizeWQ,uint256 sharesToBurnForWithdrawals,uint256 totalSharesToBurn,uint256 sharesToMintAsFees,(address[] moduleFeeRecipients,uint256[] moduleIds,uint256[] moduleSharesToMint,uint256 treasurySharesToMint) feeDistribution,uint256 principalClBalance,uint256 preTotalShares,uint256 preTotalPooledEther,uint256 postInternalShares,uint256 postInternalEther,uint256 postTotalShares,uint256 postTotalPooledEther) update)",
]);
const accountingReportParameters = [
  getAbiItem({ abi: AccountingOracle_ABI, name: "submitReportData" }).inputs[0],
] as const;

export type AccountingReport = ContractFunctionArgs<typeof AccountingOracle_ABI, "nonpayable", "submitReportData">[0];

export type AccountingReportSimulation = ContractFunctionReturnType<
  typeof accountingAbi,
  "view",
  "simulateOracleReport"
>;

export function accountingReportHash(report: AccountingReport): Hex {
  return keccak256(encodeAbiParameters(accountingReportParameters, [report]));
}

export async function advanceToNextFrame(
  client: DevRpcClient,
  consensus: Contract<typeof HashConsensus_ABI>,
): Promise<bigint> {
  const [slotsPerEpoch, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
  const [, epochsPerFrame] = await client.read(consensus, "getFrameConfig");
  const [previousRefSlot] = await client.read(consensus, "getCurrentFrame");
  const nextRefSlot = previousRefSlot + slotsPerEpoch * epochsPerFrame;
  await client.setTime(genesisTime + (nextRefSlot + 1n) * secondsPerSlot);
  const [refSlot] = await client.read(consensus, "getCurrentFrame");
  assert.equal(refSlot, nextRefSlot, "next reporting frame");
  return refSlot;
}

async function resolveMemberCall(
  client: DevRpcClient,
  impersonated: ImpersonatedAccounts,
  member: Address,
  target: Address,
  data: Hex,
): Promise<{ sender: Address; to: Address; data: Hex }> {
  if (!(await client.viemClient.getCode({ address: member }))) {
    await impersonated.impersonate(client, member);
    return { sender: member, to: target, data };
  }
  const delegate = await client.read(contract(delegationAbi, member), "getDelegate");
  await impersonated.impersonate(client, delegate);
  return {
    sender: delegate,
    to: member,
    data: encodeFunctionData({ abi: delegationAbi, functionName: "execute", args: [target, data] }),
  };
}

// Oracle members are EOAs or delegation contracts executing through their delegate
export async function callAsOracleMember(
  client: DevRpcClient,
  impersonated: ImpersonatedAccounts,
  member: Address,
  target: Address,
  data: Hex,
): Promise<CallReturnType> {
  const memberCall = await resolveMemberCall(client, impersonated, member, target, data);
  return client.viemClient.call({ account: memberCall.sender, to: memberCall.to, data: memberCall.data });
}

export async function sendAsOracleMember(
  client: DevRpcClient,
  impersonated: ImpersonatedAccounts,
  member: Address,
  target: Address,
  data: Hex,
): Promise<TransactionReceipt> {
  const memberCall = await resolveMemberCall(client, impersonated, member, target, data);
  // Preflight surfaces revert data even on nodes that mine reverted transactions
  await client.viemClient.call({ account: memberCall.sender, to: memberCall.to, data: memberCall.data });
  const hash = await client.viemClient.sendTransaction({
    account: memberCall.sender,
    to: memberCall.to,
    data: memberCall.data,
    chain: client.viemClient.chain,
  });
  const receipt = await client.viemClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", "oracle member transaction");
  return receipt;
}

export async function reachConsensus(
  client: DevRpcClient,
  impersonated: ImpersonatedAccounts,
  consensus: Contract<typeof HashConsensus_ABI>,
  refSlot: bigint,
  reportHash: Hex,
  consensusVersion: bigint,
): Promise<readonly Address[]> {
  const [members] = await client.read(consensus, "getFastLaneMembers");
  assert.isNotEmpty(members, "fast lane members");
  for (const member of members) {
    await sendAsOracleMember(
      client,
      impersonated,
      member,
      consensus.address,
      encodeFunctionData({
        abi: HashConsensus_ABI,
        functionName: "submitReport",
        args: [refSlot, reportHash, consensusVersion],
      }),
    );
  }
  const [, consensusReportHash] = await client.read(consensus, "getConsensusState");
  assert.equal(consensusReportHash, reportHash, "consensus report hash");
  return members;
}

// Builds a report for the current frame with no withdrawal finalization; callers set batches
export async function prepareAccountingReport(
  client: DevRpcClient,
  locator: Contract<typeof LidoLocator_ABI>,
): Promise<{ report: AccountingReport; simulation: AccountingReportSimulation }> {
  const oracle = contract(AccountingOracle_ABI, await client.read(locator, "accountingOracle"));
  const consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
  const lido = contract(Lido_ABI, await client.read(locator, "lido"));
  const checker = contract(OracleReportSanityChecker_ABI, await client.read(locator, "oracleReportSanityChecker"));
  const burner = contract(Burner_ABI, await client.read(locator, "burner"));
  const router = contract(StakingRouter_ABI, await client.read(locator, "stakingRouter"));
  const accounting = contract(accountingAbi, await client.read(locator, "accounting"));

  const [refSlot] = await client.read(consensus, "getCurrentFrame");
  const [, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
  const [active, pending, , deposited] = await client.read(lido, "getBalanceStats");
  const clPendingBalance = pending + deposited;
  const withdrawalVaultBalance = await client.getBalance(await client.read(locator, "withdrawalVault"));
  const clWithdrawals = withdrawalVaultBalance - (await client.read(checker, "lastVaultBalanceAfterTransfer"));
  const clValidatorsBalance = active - clWithdrawals + parseEther("10");
  const elRewardsVaultBalance = await client.getBalance(await client.read(locator, "elRewardsVault"));
  const [coverShares, nonCoverShares] = await client.read(burner, "getSharesRequestedToBurn");

  const moduleIds = await client.read(router, "getStakingModuleIds");
  const storedModuleBalances = await Promise.all(
    moduleIds.map((id) => client.read(router, "getModuleValidatorsBalance", [id])),
  );
  const totalModuleBalance = storedModuleBalances.reduce((sum, balance) => sum + balance, 0n);
  const clValidatorsBalanceGwei = clValidatorsBalance / 10n ** 9n;
  const moduleBalancesGwei = storedModuleBalances.map(
    (balance) => (balance * clValidatorsBalanceGwei) / totalModuleBalance,
  );
  moduleBalancesGwei[0] += clValidatorsBalanceGwei - moduleBalancesGwei.reduce((sum, balance) => sum + balance, 0n);

  const simulation = await client.read(accounting, "simulateOracleReport", [
    {
      timestamp: genesisTime + refSlot * secondsPerSlot,
      timeElapsed: 86400n,
      clValidatorsBalance,
      clPendingBalance,
      withdrawalVaultBalance,
      elRewardsVaultBalance,
      sharesRequestedToBurn: 0n,
      withdrawalFinalizationBatches: [],
      simulatedShareRate: 0n,
    },
  ]);
  const report: AccountingReport = {
    consensusVersion: await client.read(oracle, "getConsensusVersion"),
    refSlot,
    clValidatorsBalanceGwei,
    clPendingBalanceGwei: clPendingBalance / 10n ** 9n,
    stakingModuleIdsWithNewlyExitedValidators: [],
    numExitedValidatorsByStakingModule: [],
    stakingModuleIdsWithUpdatedBalance: moduleIds,
    validatorBalancesGweiByStakingModule: moduleBalancesGwei,
    withdrawalVaultBalance,
    elRewardsVaultBalance,
    sharesRequestedToBurn: coverShares + nonCoverShares,
    withdrawalFinalizationBatches: [],
    simulatedShareRate: (simulation.postTotalPooledEther * 10n ** 27n) / simulation.postTotalShares,
    isBunkerMode: (await client.read(lido, "getTotalPooledEther")) > simulation.postTotalPooledEther,
    vaultsDataTreeRoot: zeroHash,
    vaultsDataTreeCid: "test_vaults_data_tree_cid",
    extraDataFormat: 0n,
    extraDataHash: zeroHash,
    extraDataItemsCount: 0n,
  };
  return { report, simulation };
}
