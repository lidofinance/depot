import { rejects } from "node:assert/strict";
import hre from "hardhat";
import type { Context } from "mocha";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  isHex,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseEther,
  slice,
  stringToHex,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type ContractFunctionArgs,
  type Hex,
} from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";
import { Burner_ABI } from "@/abi/Burner.abi";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { WithdrawalQueue_ABI } from "@/abi/WithdrawalQueue.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const delegationAbi = parseAbi([
  "function getDelegate() view returns (address)",
  "function execute(address target, bytes data) returns (bytes)",
]);
const accountingAbi = parseAbi([
  "function simulateOracleReport((uint256 timestamp,uint256 timeElapsed,uint256 clValidatorsBalance,uint256 clPendingBalance,uint256 withdrawalVaultBalance,uint256 elRewardsVaultBalance,uint256 sharesRequestedToBurn,uint256[] withdrawalFinalizationBatches,uint256 simulatedShareRate) report) view returns ((uint256 withdrawalsVaultTransfer,uint256 elRewardsVaultTransfer,uint256 etherToFinalizeWQ,uint256 sharesToFinalizeWQ,uint256 sharesToBurnForWithdrawals,uint256 totalSharesToBurn,uint256 sharesToMintAsFees,(address[] moduleFeeRecipients,uint256[] moduleIds,uint256[] moduleSharesToMint,uint256 treasurySharesToMint) feeDistribution,uint256 principalClBalance,uint256 preTotalShares,uint256 preTotalPooledEther,uint256 postInternalShares,uint256 postInternalEther,uint256 postTotalShares,uint256 postTotalPooledEther) update)",
]);
type Report = ContractFunctionArgs<typeof AccountingOracle_ABI, "nonpayable", "submitReportData">[0];
const reportParameters = [getAbiItem({ abi: AccountingOracle_ABI, name: "submitReportData" }).inputs[0]] as const;
const nonZeroHash = toHex(1n, { size: 32 });

function reportHash(report: Report): Hex {
  return keccak256(encodeAbiParameters(reportParameters, [report]));
}

async function expectRevert(action: Promise<unknown>, signature: string, args: readonly (bigint | Hex)[] = []) {
  const types = signature.slice(signature.indexOf("(") + 1, -1);
  const expected = concat([
    slice(keccak256(stringToHex(signature)), 0, 4),
    types ? encodeAbiParameters(parseAbiParameters(types), args) : "0x",
  ]);
  await rejects(
    action,
    (error: unknown) => {
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
    },
    signature,
  );
}

function extraDataItem(
  index: number,
  type: number,
  module: number,
  operators: readonly number[],
  counts: readonly bigint[],
): Hex {
  return concat([
    toHex(index, { size: 3 }),
    toHex(type, { size: 2 }),
    toHex(module, { size: 3 }),
    toHex(operators.length, { size: 8 }),
    ...operators.map((id) => toHex(id, { size: 8 })),
    ...counts.map((count) => toHex(count, { size: 16 })),
  ]);
}

function extraData(items: readonly Hex[]): Hex {
  return concat([zeroHash, ...items]);
}

describe("AccountingOracle negative acceptance", function () {
  let client: DevRpcClient;
  let oracle: Contract<typeof AccountingOracle_ABI>;
  let consensus: Contract<typeof HashConsensus_ABI>;
  let lido: Contract<typeof Lido_ABI>;
  let router: Contract<typeof StakingRouter_ABI>;
  let nor: Contract<typeof NodeOperatorsRegistry_ABI>;
  let queue: Contract<typeof WithdrawalQueue_ABI>;
  let burner: Contract<typeof Burner_ABI>;
  let checker: Contract<typeof OracleReportSanityChecker_ABI>;
  let accounting: Contract<typeof accountingAbi>;
  let agent: Address;
  let stranger: Address;
  let withdrawalVault: Address;
  let elRewardsVault: Address;
  let snapshot: Hex;

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    const { locator } = getGovernanceContracts(network);
    oracle = contract(AccountingOracle_ABI, await client.read(locator, "accountingOracle"));
    consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
    lido = contract(Lido_ABI, await client.read(locator, "lido"));
    router = contract(StakingRouter_ABI, await client.read(locator, "stakingRouter"));
    nor = contract(
      NodeOperatorsRegistry_ABI,
      (await client.read(router, "getStakingModule", [1n])).stakingModuleAddress,
    );
    queue = contract(WithdrawalQueue_ABI, await client.read(locator, "withdrawalQueue"));
    burner = contract(Burner_ABI, await client.read(locator, "burner"));
    checker = contract(OracleReportSanityChecker_ABI, await client.read(locator, "oracleReportSanityChecker"));
    accounting = contract(accountingAbi, await client.read(locator, "accounting"));
    withdrawalVault = await client.read(locator, "withdrawalVault");
    elRewardsVault = await client.read(locator, "elRewardsVault");
    agent = await client.read(oracle, "getRoleMember", [await client.read(oracle, "DEFAULT_ADMIN_ROLE"), 0n]);
    [stranger] = await client.getAccounts();
    await hre.tasks
      .getTask("build")
      .run({ files: ["contracts/mocks/MockHashConsensus.sol"], noTests: true, quiet: true });
  });

  beforeEach(async function () {
    snapshot = await client.snapshot();
  });
  afterEach(async function () {
    await client.revert(snapshot);
  });

  async function sendAsMember(target: Address, data: Hex, member?: Address) {
    member ??= (await client.read(consensus, "getFastLaneMembers"))[0][0];
    const code = await client.viemClient.getCode({ address: member });
    if (!code || code === "0x") {
      await client.impersonate(member, parseEther("10"));
      const hash = await client.viemClient.sendTransaction({
        account: member,
        to: target,
        data,
        chain: client.viemClient.chain,
      });
      return client.viemClient.waitForTransactionReceipt({ hash });
    }
    const delegation = contract(delegationAbi, member);
    const delegate = await client.read(delegation, "getDelegate");
    await client.impersonate(delegate, parseEther("10"));
    return client.write(delegation, "execute", [target, data], { from: delegate });
  }

  function submitData(report: Report, version: bigint) {
    return sendAsMember(
      oracle.address,
      encodeFunctionData({ abi: AccountingOracle_ABI, functionName: "submitReportData", args: [report, version] }),
    );
  }

  async function prepareReport(changes: Partial<Report> = {}): Promise<Report> {
    const [slots, seconds, genesis] = await client.read(consensus, "getChainConfig");
    const [refSlot] = await client.read(consensus, "getCurrentFrame");
    const [, epochs] = await client.read(consensus, "getFrameConfig");
    await client.setTime(genesis + (refSlot + slots * epochs + 1n) * seconds);
    const [nextRefSlot] = await client.read(consensus, "getCurrentFrame");
    const [active, pending, , deposited] = await client.read(lido, "getBalanceStats");
    const withdrawalVaultBalance = await client.getBalance(withdrawalVault);
    const previousVaultBalance = await client.read(checker, "lastVaultBalanceAfterTransfer");
    const clValidatorsBalance = active - (withdrawalVaultBalance - previousVaultBalance) + parseEther("10");
    const clPendingBalance = pending + deposited;
    const moduleIds = await client.read(router, "getStakingModuleIds");
    const stored = await Promise.all(moduleIds.map((id) => client.read(router, "getModuleValidatorsBalance", [id])));
    const storedGwei = stored.map((balance) => balance / 10n ** 9n);
    const totalStored = storedGwei.reduce((sum, value) => sum + value, 0n);
    const target = clValidatorsBalance / 10n ** 9n;
    const balances = storedGwei.map((balance) => (balance * target) / totalStored);
    balances[0] += target - balances.reduce((sum, value) => sum + value, 0n);
    const elRewardsVaultBalance = await client.getBalance(elRewardsVault);
    const [cover, nonCover] = await client.read(burner, "getSharesRequestedToBurn");
    const simulation = await client.read(accounting, "simulateOracleReport", [
      {
        timestamp: genesis + nextRefSlot * seconds,
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
    const simulatedShareRate = (simulation.postTotalPooledEther * 10n ** 27n) / simulation.postTotalShares;
    const buffered = await client.read(lido, "getBufferedEther");
    const unfinalized = await client.read(queue, "unfinalizedStETH");
    const budget =
      simulation.withdrawalsVaultTransfer +
      simulation.elRewardsVaultTransfer +
      (buffered < unfinalized ? buffered : unfinalized);
    const batches: bigint[] = [];
    if (budget > 0n) {
      const { requestTimestampMargin } = await client.read(checker, "getOracleReportLimits");
      let state: ContractFunctionArgs<typeof WithdrawalQueue_ABI, "view", "calculateFinalizationBatches">[3] = {
        remainingEthBudget: budget,
        finished: false,
        batches: [
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
        ],
        batchesLength: 0n,
      };
      while (!state.finished) {
        state = await client.read(queue, "calculateFinalizationBatches", [
          simulatedShareRate,
          BigInt(await client.getChainTime()) - requestTimestampMargin,
          1000n,
          state,
        ]);
      }
      batches.push(...state.batches.filter((id) => id > 0n));
    }
    return {
      consensusVersion: await client.read(oracle, "getConsensusVersion"),
      refSlot: nextRefSlot,
      clValidatorsBalanceGwei: target,
      clPendingBalanceGwei: clPendingBalance / 10n ** 9n,
      stakingModuleIdsWithNewlyExitedValidators: [],
      numExitedValidatorsByStakingModule: [],
      stakingModuleIdsWithUpdatedBalance: moduleIds,
      validatorBalancesGweiByStakingModule: balances,
      withdrawalVaultBalance,
      elRewardsVaultBalance,
      sharesRequestedToBurn: cover + nonCover,
      withdrawalFinalizationBatches: batches,
      simulatedShareRate,
      isBunkerMode: (await client.read(lido, "getTotalPooledEther")) > simulation.postTotalPooledEther,
      vaultsDataTreeRoot: zeroHash,
      vaultsDataTreeCid: "test_vaults_data_tree_cid",
      extraDataFormat: 0n,
      extraDataHash: zeroHash,
      extraDataItemsCount: 0n,
      ...changes,
    };
  }

  async function pushReport(report: Report) {
    const deadline = BigInt(await client.getChainTime()) + 100n;
    await client.impersonate(consensus.address, parseEther("10"));
    await client.write(oracle, "submitConsensusReport", [reportHash(report), report.refSlot, deadline], {
      from: consensus.address,
    });
    return deadline;
  }

  async function report(data?: Hex, itemsCount = 2n) {
    const current = await prepareReport(
      data === undefined
        ? {}
        : { extraDataFormat: 1n, extraDataHash: keccak256(data), extraDataItemsCount: itemsCount },
    );
    const [members] = await client.read(consensus, "getFastLaneMembers");
    for (const member of members) {
      await sendAsMember(
        consensus.address,
        encodeFunctionData({
          abi: HashConsensus_ABI,
          functionName: "submitReport",
          args: [current.refSlot, reportHash(current), current.consensusVersion],
        }),
        member,
      );
    }
    await submitData(current, await client.read(oracle, "getContractVersion"));
    return sendAsMember(
      oracle.address,
      encodeFunctionData({
        abi: AccountingOracle_ABI,
        functionName: data === undefined ? "submitReportExtraDataEmpty" : "submitReportExtraDataList",
        args: data === undefined ? [] : [data],
      }),
    );
  }

  async function ensureProcessing() {
    if (!(await client.read(oracle, "getConsensusReport"))[3]) {
      await report();
    }
    await client.impersonate(consensus.address, parseEther("10"));
    return client.read(oracle, "getLastProcessingRefSlot");
  }

  async function exited(operator: number) {
    return (await client.read(nor, "getNodeOperatorSummary", [BigInt(operator)]))[5];
  }

  it("rejects unauthorized senders", async function () {
    const current = await prepareReport();
    await expectRevert(
      client.simulate(oracle, "submitReportExtraDataEmpty", [], { from: stranger }),
      "SenderNotAllowed()",
    );
    await expectRevert(
      client.simulate(oracle, "submitReportExtraDataList", ["0x"], { from: stranger }),
      "SenderNotAllowed()",
    );
    await expectRevert(
      client.simulate(oracle, "submitReportData", [current, await client.read(oracle, "getContractVersion")], {
        from: stranger,
      }),
      "SenderNotAllowed()",
    );
    await expectRevert(
      client.simulate(
        oracle,
        "submitConsensusReport",
        [reportHash(current), current.refSlot, BigInt(await client.getChainTime())],
        { from: stranger },
      ),
      "SenderIsNotTheConsensusContract()",
    );
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [current.refSlot], { from: stranger }),
      "SenderIsNotTheConsensusContract()",
    );
  });

  it("rejects invalid consensus reports", async function () {
    const last = await ensureProcessing();
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last - 1n, BigInt(await client.getChainTime())], {
        from: consensus.address,
      }),
      "RefSlotCannotDecrease(uint256,uint256)",
      [last - 1n, last],
    );
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last, BigInt(await client.getChainTime())], {
        from: consensus.address,
      }),
      "RefSlotMustBeGreaterThanProcessingOne(uint256,uint256)",
      [last, last],
    );
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last + 1n, 42n], { from: consensus.address }),
      "ProcessingDeadlineMissed(uint256)",
      [42n],
    );
    await expectRevert(
      client.simulate(
        oracle,
        "submitConsensusReport",
        [zeroHash, last + 1n, BigInt(await client.getChainTime()) + 3n],
        { from: consensus.address },
      ),
      "HashCannotBeZero()",
    );
  });

  it("rejects discarding older or processing consensus reports", async function () {
    const last = await ensureProcessing();
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [last - 1n], { from: consensus.address }),
      "RefSlotCannotDecrease(uint256,uint256)",
      [last - 1n, last],
    );
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [last], { from: consensus.address }),
      "RefSlotAlreadyProcessing()",
    );
  });

  it("rejects setting the same consensus version", async function () {
    await client.impersonate(agent, parseEther("10"));
    await client.write(oracle, "grantRole", [await client.read(oracle, "MANAGE_CONSENSUS_VERSION_ROLE"), agent], {
      from: agent,
    });
    await expectRevert(
      client.simulate(oracle, "setConsensusVersion", [await client.read(oracle, "getConsensusVersion")], {
        from: agent,
      }),
      "VersionCannotBeSame()",
    );
  });

  it("rejects invalid consensus contracts", async function () {
    await client.impersonate(agent, parseEther("10"));
    await client.write(oracle, "grantRole", [await client.read(oracle, "MANAGE_CONSENSUS_CONTRACT_ROLE"), agent], {
      from: agent,
    });
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [zeroAddress], { from: agent }),
      "AddressCannotBeZero()",
    );
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [consensus.address], { from: agent }),
      "AddressCannotBeSame()",
    );
    const artifact = await hre.artifacts.readArtifact("MockHashConsensus");
    if (!isHex(artifact.bytecode)) {
      throw new Error("MockHashConsensus artifact has invalid bytecode");
    }
    const mock = { abi: artifact.abi, bytecode: artifact.bytecode };
    const mismatched = await client.deployContract({ ...mock, args: [42n, 17n, 100500n, 0n] }, { from: stranger });
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [mismatched], { from: agent }),
      "UnexpectedChainConfig()",
    );
    const older = await client.deployContract(
      {
        ...mock,
        args: [99n, await client.read(oracle, "SECONDS_PER_SLOT"), await client.read(oracle, "GENESIS_TIME"), 13n],
      },
      { from: stranger },
    );
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [older], { from: agent }),
      "InitialRefSlotCannotBeLessThanProcessingOne(uint256,uint256)",
      [13n, await client.read(oracle, "getLastProcessingRefSlot")],
    );
  });

  it("rejects finalizing the upgrade again", async function () {
    await expectRevert(
      client.simulate(oracle, "finalizeUpgrade_v5", [6n], { from: stranger }),
      "InvalidContractVersionIncrement()",
    );
  });

  describe("submitReportExtraDataList", function () {
    it("rejects too short extra data items", async function () {
      await expectRevert(
        report(extraData([slice(extraDataItem(0, 2, 2, [2], [2n]), 0, 36)])),
        "InvalidExtraDataItem(uint256)",
        [0n],
      );
      const count = await exited(2);
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2, 3, 4, 5], [count]), extraDataItem(1, 2, 2, [2], [count])])),
        "InvalidExtraDataItem(uint256)",
        [0n],
      );
    });
    it("rejects zero node operator count", async function () {
      await expectRevert(report(extraData([extraDataItem(0, 2, 2, [], [1n])])), "InvalidExtraDataItem(uint256)", [0n]);
    });
    it("rejects zero module IDs", async function () {
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 0, [2], [1n]), extraDataItem(1, 2, 0, [2], [2n])])),
        "InvalidExtraDataItem(uint256)",
        [0n],
      );
    });
    it("rejects unexpected extra data indices", async function () {
      await expectRevert(
        report(extraData([extraDataItem(1, 2, 1, [2], [1n]), extraDataItem(2, 2, 2, [2], [1n])])),
        "UnexpectedExtraDataIndex(uint256,uint256)",
        [0n, 1n],
      );
      const count = await exited(2);
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2], [count]), extraDataItem(3, 2, 1, [2], [count])])),
        "UnexpectedExtraDataIndex(uint256,uint256)",
        [1n, 3n],
      );
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2], [count]), extraDataItem(0, 2, 1, [2], [count])])),
        "UnexpectedExtraDataIndex(uint256,uint256)",
        [1n, 0n],
      );
    });
    it("rejects unsupported extra data types", async function () {
      await expectRevert(
        report(extraData([extraDataItem(0, 3, 1, [1], [1n])]), 1n),
        "UnsupportedExtraDataType(uint256,uint256)",
        [0n, 3n],
      );
    });
    it("rejects duplicate items", async function () {
      const operator = client.getNetworkName() === "hoodi" ? 0 : 2;
      const count = (await exited(operator)) + 1n;
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [operator], [count]), extraDataItem(1, 2, 1, [operator], [count])])),
        "InvalidExtraDataSortOrder(uint256)",
        [1n],
      );
    });
    it("rejects duplicate operators with decreasing exited counts", async function () {
      const operator = client.getNetworkName() === "hoodi" ? 0 : 33;
      const count = await exited(operator);
      await expectRevert(
        report(
          extraData([
            extraDataItem(0, 2, 1, [operator], [count + 2n]),
            extraDataItem(1, 2, 1, [operator], [count + 1n]),
          ]),
        ),
        "InvalidExtraDataSortOrder(uint256)",
        [1n],
      );
    });
    it("rejects unsorted exited operators", async function () {
      const ids = [33, 35, 34];
      const counts = await Promise.all(ids.map(async (id) => (await exited(id)) + 1n));
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, ids, counts)])),
        "InvalidExtraDataSortOrder(uint256)",
        [0n],
      );
    });
    it("rejects unexpected extra data item count", async function () {
      const ids = [2, 4, 5, 6, 7, 9, 10, 11];
      const increase = client.getNetworkName() === "hoodi" ? 0n : 1n;
      const items = await Promise.all(
        ids.map(async (id, index) => extraDataItem(index, 2, 1, [id], [(await exited(id)) + increase])),
      );
      await expectRevert(report(extraData(items), 7n), "UnexpectedExtraDataItemsCount(uint256,uint256)", [7n, 8n]);
    });
    it("rejects already processed extra data", async function () {
      const operator = client.getNetworkName() === "hoodi" ? 0 : 33;
      await report(extraData([extraDataItem(0, 2, 1, [operator], [(await exited(operator)) + 1n])]), 1n);
      await expectRevert(
        sendAsMember(
          oracle.address,
          encodeFunctionData({ abi: AccountingOracle_ABI, functionName: "submitReportExtraDataList", args: ["0x"] }),
        ),
        "ExtraDataAlreadyProcessed()",
      );
    });
  });

  describe("submitReportData", function () {
    it("rejects invalid versions, reference slots, hashes, repeated data and missed deadlines", async function () {
      const current = await prepareReport();
      const deadline = await pushReport(current);
      const version = await client.read(oracle, "getContractVersion");
      await expectRevert(submitData(current, 42n), "UnexpectedContractVersion(uint256,uint256)", [version, 42n]);
      await expectRevert(submitData({ ...current, refSlot: 42n }, version), "UnexpectedRefSlot(uint256,uint256)", [
        current.refSlot,
        42n,
      ]);
      await expectRevert(
        submitData({ ...current, consensusVersion: 66n }, version),
        "UnexpectedConsensusVersion(uint256,uint256)",
        [current.consensusVersion, 66n],
      );
      const broken = { ...current, simulatedShareRate: 0n };
      await expectRevert(submitData(broken, version), "UnexpectedDataHash(bytes32,bytes32)", [
        reportHash(current),
        reportHash(broken),
      ]);
      await submitData(current, version);
      await expectRevert(submitData(current, version), "RefSlotAlreadyProcessing()");
      await client.setTime(deadline + 42n);
      await expectRevert(submitData(current, version), "ProcessingDeadlineMissed(uint256)", [deadline]);
    });
    it("rejects inconsistent extra data metadata", async function () {
      const version = await client.read(oracle, "getContractVersion");
      let current = await prepareReport({ extraDataHash: nonZeroHash });
      await pushReport(current);
      await expectRevert(submitData(current, version), "UnexpectedExtraDataHash(bytes32,bytes32)", [
        zeroHash,
        nonZeroHash,
      ]);
      current = await prepareReport({ extraDataItemsCount: 42n });
      await pushReport(current);
      await expectRevert(submitData(current, version), "UnexpectedExtraDataItemsCount(uint256,uint256)", [0n, 42n]);
      current = await prepareReport({ extraDataFormat: 66n });
      await pushReport(current);
      await expectRevert(submitData(current, version), "UnsupportedExtraDataFormat(uint256)", [66n]);
      current = await prepareReport({ extraDataFormat: 1n });
      await pushReport(current);
      await expectRevert(submitData(current, version), "ExtraDataItemsCountCannotBeZeroForNonEmptyData()");
      current = await prepareReport({ extraDataFormat: 1n, extraDataItemsCount: 42n });
      await pushReport(current);
      await expectRevert(submitData(current, version), "ExtraDataHashCannotBeZeroForNonEmptyData()");
    });
    it("rejects invalid exited validator module data", async function () {
      const version = await client.read(oracle, "getContractVersion");
      for (const [modules, counts] of [
        [[0n, 0n], [0n]],
        [
          [2n, 1n],
          [0n, 0n],
        ],
        [
          [1n, 2n],
          [1n, 0n],
        ],
      ] as const) {
        const current = await prepareReport({
          stakingModuleIdsWithNewlyExitedValidators: modules,
          numExitedValidatorsByStakingModule: counts,
        });
        await pushReport(current);
        await expectRevert(submitData(current, version), "InvalidExitedValidatorsData()");
      }
    });
  });
});
