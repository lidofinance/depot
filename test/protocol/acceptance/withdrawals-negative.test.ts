import { assert } from "chai";

import { type Address, type Hex, encodeErrorResult, encodeFunctionData, maxUint256 } from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";

import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";

import { WithdrawalQueue_ABI } from "@/abi/WithdrawalQueue.abi";
import { WstETH_ABI } from "@/abi/WstETH.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { expectRevert } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import {
  accountingReportHash,
  advanceToNextFrame,
  callAsOracleMember,
  prepareAccountingReport,
  reachConsensus,
} from "@/test/protocol/helpers/oracle";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const MIN_STETH_WITHDRAWAL_AMOUNT = 100n;
const MAX_STETH_WITHDRAWAL_AMOUNT = 1000n * 10n ** 18n;

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
  const impersonated = new ImpersonatedAccounts();

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    locator = getGovernanceContracts(network).locator;
    queue = contract(WithdrawalQueue_ABI, await client.read(locator, "withdrawalQueue"));
    steth = contract(Lido_ABI, await client.read(locator, "lido"));
    wsteth = contract(WstETH_ABI, await client.read(locator, "wstETH"));
    // wstETH contract holds enough stETH on both networks to fund requests
    whale = wsteth.address;
    oracle = contract(AccountingOracle_ABI, await client.read(locator, "accountingOracle"));
    consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
  });

  beforeEach(async function () {
    snapshot = await client.snapshot();
    await impersonated.impersonate(client, whale);
    await client.write(steth, "approve", [queue.address, maxUint256], { from: whale });
    await client.write(wsteth, "approve", [queue.address, maxUint256], { from: whale });
  });

  afterEach(async function () {
    try {
      await impersonated.stopAll(client);
    } finally {
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

  async function oracleReport(batches: bigint[], shareRate?: bigint, advanceFrame = true) {
    if (advanceFrame) {
      await advanceToNextFrame(client, consensus);
    }
    const { report: baseReport } = await prepareAccountingReport(client, locator);
    const report = {
      ...baseReport,
      withdrawalFinalizationBatches: batches,
      simulatedShareRate: shareRate ?? baseReport.simulatedShareRate,
    };
    const [member] = await reachConsensus(
      client,
      impersonated,
      consensus,
      report.refSlot,
      accountingReportHash(report),
      report.consensusVersion,
    );
    return callAsOracleMember(
      client,
      impersonated,
      member,
      oracle.address,
      encodeFunctionData({
        abi: AccountingOracle_ABI,
        functionName: "submitReportData",
        args: [report, await client.read(oracle, "getContractVersion")],
      }),
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
    await advanceToNextFrame(client, consensus);
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
    await impersonated.impersonate(client, steth.address);
    await client.write(queue, "finalize", [last, 1n], { from: steth.address });
    assert.equal(await client.read(queue, "getLastFinalizedRequestId"), last);
    await expectRevert(
      client.simulate(queue, "finalize", [last + 1n, 1n], { from: steth.address }),
      encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "InvalidRequestId", args: [last + 1n] }),
    );
  });

  it("rejects finalizing already finalized request 4 after adding three requests", async function () {
    assert.isTrue((await client.read(queue, "getLastFinalizedRequestId")) >= 4n, "request 4 is already finalized");
    await impersonated.impersonate(client, steth.address);
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
