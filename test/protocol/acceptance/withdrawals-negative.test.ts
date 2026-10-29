import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  type Address,
  type ContractFunctionArgs,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseAbi,
  parseEther,
  zeroHash,
} from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";
import { Burner_ABI } from "@/abi/Burner.abi";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { WithdrawalQueue_ABI } from "@/abi/WithdrawalQueue.abi";
import { WstETH_ABI } from "@/abi/WstETH.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const MIN_STETH_WITHDRAWAL_AMOUNT = 100n;
const MAX_STETH_WITHDRAWAL_AMOUNT = 1000n * 10n ** 18n;
const configurations = {
  mainnet: {
    queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  },
  hoodi: {
    queue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    steth: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    wsteth: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
  },
} as const;
const delegationAbi = parseAbi([
  "function getDelegate() view returns (address)",
  "function execute(address target, bytes data) returns (bytes)",
]);
const accountingAbi = parseAbi([
  "function simulateOracleReport((uint256 timestamp,uint256 timeElapsed,uint256 clValidatorsBalance,uint256 clPendingBalance,uint256 withdrawalVaultBalance,uint256 elRewardsVaultBalance,uint256 sharesRequestedToBurn,uint256[] withdrawalFinalizationBatches,uint256 simulatedShareRate) report) view returns ((uint256 withdrawalsVaultTransfer,uint256 elRewardsVaultTransfer,uint256 etherToFinalizeWQ,uint256 sharesToFinalizeWQ,uint256 sharesToBurnForWithdrawals,uint256 totalSharesToBurn,uint256 sharesToMintAsFees,(address[] moduleFeeRecipients,uint256[] moduleIds,uint256[] moduleSharesToMint,uint256 treasurySharesToMint) feeDistribution,uint256 principalClBalance,uint256 preTotalShares,uint256 preTotalPooledEther,uint256 postInternalShares,uint256 postInternalEther,uint256 postTotalShares,uint256 postTotalPooledEther) update)",
]);
type Report = ContractFunctionArgs<typeof AccountingOracle_ABI, "nonpayable", "submitReportData">[0];

async function expectRevert(action: Promise<unknown>, expected: Hex): Promise<void> {
  await rejects(action, (error: unknown) => {
    const revert =
      error instanceof BaseError &&
      error.walk(
        (cause) =>
          cause instanceof ContractFunctionRevertedError ||
          (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
      );
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.raw === expected;
    }
    return revert instanceof Error && "data" in revert && revert.data === expected;
  });
}

describe("Withdrawals negative acceptance", function () {
  let client: DevRpcClient;
  let queue: Contract<typeof WithdrawalQueue_ABI>;
  let steth: Contract<typeof Lido_ABI>;
  let wsteth: Contract<typeof WstETH_ABI>;
  let oracle: Contract<typeof AccountingOracle_ABI>;
  let consensus: Contract<typeof HashConsensus_ABI>;
  let locator: ReturnType<typeof getGovernanceContracts>["locator"];
  let whale: Address;
  let snapshot: Hex;
  const impersonated = new Set<Address>();

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    const addresses = configurations[network];
    queue = contract(WithdrawalQueue_ABI, addresses.queue);
    steth = contract(Lido_ABI, addresses.steth);
    wsteth = contract(WstETH_ABI, addresses.wsteth);
    whale = addresses.wsteth;
    locator = getGovernanceContracts(network).locator;
    oracle = contract(AccountingOracle_ABI, await client.read(locator, "accountingOracle"));
    consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
  });

  async function impersonate(account: Address): Promise<void> {
    await client.impersonate(account, parseEther("10"));
    impersonated.add(account);
  }

  beforeEach(async function () {
    snapshot = await client.snapshot();
    await impersonate(whale);
    await client.write(steth, "approve", [queue.address, maxUint256], { from: whale });
    await client.write(wsteth, "approve", [queue.address, maxUint256], { from: whale });
  });

  afterEach(async function () {
    try {
      for (const account of impersonated) {
        await client.stopImpersonating(account);
      }
    } finally {
      impersonated.clear();
      await client.revert(snapshot);
    }
  });

  async function fillQueue(count: number): Promise<void> {
    await client.write(
      queue,
      "requestWithdrawals",
      [Array<bigint>(count).fill(MIN_STETH_WITHDRAWAL_AMOUNT + 1000n), whale],
      { from: whale },
    );
  }

  async function nextReportFrame(): Promise<void> {
    const [slotsPerEpoch, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
    const [, epochsPerFrame] = await client.read(consensus, "getFrameConfig");
    const [refSlot] = await client.read(consensus, "getCurrentFrame");
    await client.setTime(genesisTime + (refSlot + slotsPerEpoch * epochsPerFrame + 1n) * secondsPerSlot);
    assert.equal((await client.read(consensus, "getCurrentFrame"))[0], refSlot + slotsPerEpoch * epochsPerFrame);
  }

  async function edfCall(member: Address, target: Address, data: Hex, simulate = false): Promise<unknown> {
    const code = await client.viemClient.getCode({ address: member });
    if (code && code !== "0x") {
      const delegation = contract(delegationAbi, member);
      const delegate = await client.read(delegation, "getDelegate");
      await impersonate(delegate);
      if (simulate) {
        return client.simulate(delegation, "execute", [target, data], { from: delegate });
      }
      return client.write(delegation, "execute", [target, data], { from: delegate });
    }
    await impersonate(member);
    if (simulate) {
      return client.viemClient.call({ account: member, to: target, data });
    }
    const hash = await client.viemClient.sendTransaction({
      account: member,
      to: target,
      data,
      chain: client.viemClient.chain,
    });
    return client.viemClient.waitForTransactionReceipt({ hash });
  }

  async function oracleReport(batches: bigint[], shareRate?: bigint, advanceFrame = true): Promise<unknown> {
    if (advanceFrame) {
      await nextReportFrame();
    }
    const [refSlot] = await client.read(consensus, "getCurrentFrame");
    const [, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
    const [active, pending, , deposited] = await client.read(steth, "getBalanceStats");
    const clPendingBalance = pending + deposited;
    const withdrawalVaultBalance = await client.getBalance(await client.read(locator, "withdrawalVault"));
    const checker = contract(OracleReportSanityChecker_ABI, await client.read(locator, "oracleReportSanityChecker"));
    const clWithdrawals = withdrawalVaultBalance - (await client.read(checker, "lastVaultBalanceAfterTransfer"));
    const clValidatorsBalance = active - clWithdrawals + parseEther("10");
    const elRewardsVaultBalance = await client.getBalance(await client.read(locator, "elRewardsVault"));
    const burner = contract(Burner_ABI, await client.read(locator, "burner"));
    const [cover, nonCover] = await client.read(burner, "getSharesRequestedToBurn");
    const router = contract(StakingRouter_ABI, await client.read(locator, "stakingRouter"));
    const moduleIds = await client.read(router, "getStakingModuleIds");
    const balances = await Promise.all(moduleIds.map((id) => client.read(router, "getModuleValidatorsBalance", [id])));
    const total = balances.reduce((sum, balance) => sum + balance, 0n);
    const target = clValidatorsBalance / 10n ** 9n;
    const moduleBalances = balances.map((balance) => (balance * target) / total);
    moduleBalances[0] += target - moduleBalances.reduce((sum, balance) => sum + balance, 0n);
    const accounting = contract(accountingAbi, await client.read(locator, "accounting"));
    const simulated = await client.read(accounting, "simulateOracleReport", [
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
    const report: Report = {
      consensusVersion: await client.read(oracle, "getConsensusVersion"),
      refSlot,
      clValidatorsBalanceGwei: target,
      clPendingBalanceGwei: clPendingBalance / 10n ** 9n,
      stakingModuleIdsWithNewlyExitedValidators: [],
      numExitedValidatorsByStakingModule: [],
      stakingModuleIdsWithUpdatedBalance: moduleIds,
      validatorBalancesGweiByStakingModule: moduleBalances,
      withdrawalVaultBalance,
      elRewardsVaultBalance,
      sharesRequestedToBurn: cover + nonCover,
      withdrawalFinalizationBatches: batches,
      simulatedShareRate: shareRate ?? (simulated.postTotalPooledEther * 10n ** 27n) / simulated.postTotalShares,
      isBunkerMode: (await client.read(steth, "getTotalPooledEther")) > simulated.postTotalPooledEther,
      vaultsDataTreeRoot: zeroHash,
      vaultsDataTreeCid: "test_vaults_data_tree_cid",
      extraDataFormat: 0n,
      extraDataHash: zeroHash,
      extraDataItemsCount: 0n,
    };
    const reportFunction = AccountingOracle_ABI.find(
      (entry) => entry.type === "function" && entry.name === "submitReportData",
    );
    assert.isDefined(reportFunction);
    const reportHash = keccak256(encodeAbiParameters([reportFunction.inputs[0]], [report]));
    const [members] = await client.read(consensus, "getFastLaneMembers");
    for (const member of members) {
      await edfCall(
        member,
        consensus.address,
        encodeFunctionData({
          abi: HashConsensus_ABI,
          functionName: "submitReport",
          args: [refSlot, reportHash, report.consensusVersion],
        }),
      );
    }
    assert.equal((await client.read(consensus, "getConsensusState"))[1], reportHash);
    return edfCall(
      members[0],
      oracle.address,
      encodeFunctionData({
        abi: AccountingOracle_ABI,
        functionName: "submitReportData",
        args: [report, await client.read(oracle, "getContractVersion")],
      }),
      true,
    );
  }

  for (const [name, amount, errorName] of [
    ["too small", MIN_STETH_WITHDRAWAL_AMOUNT - 10n, "RequestAmountTooSmall"],
    ["too large", MAX_STETH_WITHDRAWAL_AMOUNT + 10n, "RequestAmountTooLarge"],
  ] as const) {
    it(`rejects a ${name} stETH request after a normal request`, async function () {
      await expectRevert(
        client.simulate(queue, "requestWithdrawals", [[MIN_STETH_WITHDRAWAL_AMOUNT + 10000n, amount], whale], {
          from: whale,
        }),
        encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName, args: [amount] }),
      );
    });
    it(`rejects a ${name} wstETH request with the converted stETH amount`, async function () {
      await client.write(steth, "approve", [wsteth.address, maxUint256], { from: whale });
      await client.write(wsteth, "wrap", [(await client.read(steth, "balanceOf", [whale])) / 2n], { from: whale });
      const badAmount = await client.read(wsteth, "getWstETHByStETH", [amount]);
      const normalAmount = await client.read(wsteth, "getWstETHByStETH", [MIN_STETH_WITHDRAWAL_AMOUNT + 10000n]);
      const converted =
        (badAmount * (await client.read(steth, "getTotalPooledEther"))) / (await client.read(steth, "getTotalShares"));
      assert.equal(await client.read(wsteth, "getStETHByWstETH", [badAmount]), converted);
      await expectRevert(
        client.simulate(queue, "requestWithdrawalsWstETH", [[normalAmount, badAmount], whale], { from: whale }),
        encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName, args: [converted] }),
      );
    });
  }

  it("rejects empty prefinalization batches", async function () {
    await expectRevert(
      client.viemClient.call({
        account: queue.address,
        to: queue.address,
        data: encodeFunctionData({ abi: WithdrawalQueue_ABI, functionName: "prefinalize", args: [[], 1n] }),
      }),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "EmptyBatches" }),
    );
  });

  it("rejects an oracle report finalizing the last finalized request", async function () {
    const last = await client.read(queue, "getLastFinalizedRequestId");
    await fillQueue(3);
    await expectRevert(
      oracleReport([last]),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "InvalidRequestId", args: [last] }),
    );
  });

  for (const duplicate of [false, true]) {
    it(`rejects ${duplicate ? "duplicate" : "descending"} oracle report batches`, async function () {
      const last = await client.read(queue, "getLastFinalizedRequestId");
      await fillQueue(3);
      await expectRevert(
        oracleReport(duplicate ? [last + 1n, last + 1n] : [last + 2n, last + 1n]),
        encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "BatchesAreNotSorted" }),
      );
    });
  }

  it("rejects an oracle report with zero share rate", async function () {
    const last = await client.read(queue, "getLastFinalizedRequestId");
    await fillQueue(3);
    await expectRevert(
      oracleReport([last + 1n, last + 2n], 0n),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "ZeroShareRate" }),
    );
  });

  it("rejects an oracle report finalizing a request created too close to its reference slot", async function () {
    await nextReportFrame();
    await fillQueue(1);
    const last = await client.read(queue, "getLastRequestId");
    const [status] = await client.read(queue, "getWithdrawalStatus", [[last]]);
    await expectRevert(
      oracleReport([last], undefined, false),
      encodeErrorResult({
        abi: OracleReportSanityChecker_ABI,
        errorName: "IncorrectRequestFinalization",
        args: [status.timestamp],
      }),
    );
  });

  it("rejects finalizing beyond the last request after a successful finalization", async function () {
    await fillQueue(1);
    const last = await client.read(queue, "getLastRequestId");
    await impersonate(steth.address);
    await client.write(queue, "finalize", [last, 1n], { from: steth.address });
    assert.equal(await client.read(queue, "getLastFinalizedRequestId"), last);
    await expectRevert(
      client.simulate(queue, "finalize", [last + 1n, 1n], { from: steth.address }),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "InvalidRequestId", args: [last + 1n] }),
    );
  });

  it("rejects finalizing already finalized request 4 after adding three requests", async function () {
    assert.isTrue((await client.read(queue, "getLastFinalizedRequestId")) >= 4n, "request 4 is already finalized");
    await impersonate(steth.address);
    const last = await client.read(queue, "getLastRequestId");
    if ((await client.read(queue, "getLastFinalizedRequestId")) < last) {
      await client.write(queue, "finalize", [last, 1n], { from: steth.address });
    }
    await fillQueue(3);
    await expectRevert(
      client.simulate(queue, "finalize", [4n, 1n], { from: steth.address }),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "InvalidRequestId", args: [4n] }),
    );
  });
});
