import hre from "hardhat";
import {
  concat,
  encodeFunctionData,
  isHex,
  keccak256,
  slice,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type ContractFunctionArgs,
  type Hex,
} from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";

import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { WithdrawalQueue_ABI } from "@/abi/WithdrawalQueue.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { customError, expectRevert } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import {
  accountingReportHash,
  advanceToNextFrame,
  prepareAccountingReport,
  reachConsensus,
  sendAsOracleMember,
  type AccountingReport,
} from "@/test/protocol/helpers/oracle";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const agents = {
  mainnet: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
  hoodi: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
} as const;
const nonZeroHash = toHex(1n, { size: 32 });

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
  let nor: Contract<typeof NodeOperatorsRegistry_ABI>;
  let queue: Contract<typeof WithdrawalQueue_ABI>;
  let checker: Contract<typeof OracleReportSanityChecker_ABI>;
  let locator: ReturnType<typeof getGovernanceContracts>["locator"];
  let agent: Address;
  let stranger: Address;
  let snapshot: Hex;
  const impersonated = new ImpersonatedAccounts();

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    locator = getGovernanceContracts(network).locator;
    oracle = contract(AccountingOracle_ABI, await client.read(locator, "accountingOracle"));
    consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
    lido = contract(Lido_ABI, await client.read(locator, "lido"));
    const router = contract(StakingRouter_ABI, await client.read(locator, "stakingRouter"));
    nor = contract(
      NodeOperatorsRegistry_ABI,
      (await client.read(router, "getStakingModule", [1n])).stakingModuleAddress,
    );
    queue = contract(WithdrawalQueue_ABI, await client.read(locator, "withdrawalQueue"));
    checker = contract(OracleReportSanityChecker_ABI, await client.read(locator, "oracleReportSanityChecker"));
    agent = agents[network];
    [stranger] = await client.getAccounts();
    await hre.tasks
      .getTask("build")
      .run({ files: ["contracts/mocks/MockHashConsensus.sol"], noTests: true, quiet: true });
    // Scoped build does not invalidate artifacts already cached by earlier readArtifact calls
    await hre.artifacts.clearCache();
  });

  beforeEach(async function () {
    snapshot = await client.snapshot();
  });
  afterEach(async function () {
    try {
      await impersonated.stopAll(client);
    } finally {
      await client.revert(snapshot);
    }
  });

  async function sendAsFirstMember(target: Address, data: Hex) {
    const [[member]] = await client.read(consensus, "getFastLaneMembers");
    return sendAsOracleMember(client, impersonated, member, target, data);
  }

  function submitData(report: AccountingReport, version: bigint) {
    return sendAsFirstMember(
      oracle.address,
      encodeFunctionData({ abi: AccountingOracle_ABI, functionName: "submitReportData", args: [report, version] }),
    );
  }

  async function prepareReport(changes: Partial<AccountingReport> = {}): Promise<AccountingReport> {
    await advanceToNextFrame(client, consensus);
    const { report: baseReport, simulation } = await prepareAccountingReport(client, locator);
    const { simulatedShareRate } = baseReport;
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
    return { ...baseReport, withdrawalFinalizationBatches: batches, ...changes };
  }

  async function pushReport(report: AccountingReport) {
    const deadline = BigInt(await client.getChainTime()) + 100n;
    await impersonated.impersonate(client, consensus.address);
    await client.write(oracle, "submitConsensusReport", [accountingReportHash(report), report.refSlot, deadline], {
      from: consensus.address,
    });
    return deadline;
  }

  async function report(data?: Hex, itemsCount = 2n) {
    const currentReport = await prepareReport(
      data === undefined
        ? {}
        : { extraDataFormat: 1n, extraDataHash: keccak256(data), extraDataItemsCount: itemsCount },
    );
    await reachConsensus(
      client,
      impersonated,
      consensus,
      currentReport.refSlot,
      accountingReportHash(currentReport),
      currentReport.consensusVersion,
    );
    await submitData(currentReport, await client.read(oracle, "getContractVersion"));
    return sendAsFirstMember(
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
    await impersonated.impersonate(client, consensus.address);
    return client.read(oracle, "getLastProcessingRefSlot");
  }

  async function exited(operator: number) {
    return (await client.read(nor, "getNodeOperatorSummary", [BigInt(operator)]))[5];
  }

  it("rejects unauthorized senders", async function () {
    const currentReport = await prepareReport();
    await expectRevert(
      client.simulate(oracle, "submitReportExtraDataEmpty", [], { from: stranger }),
      customError("SenderNotAllowed()"),
    );
    await expectRevert(
      client.simulate(oracle, "submitReportExtraDataList", ["0x"], { from: stranger }),
      customError("SenderNotAllowed()"),
    );
    await expectRevert(
      client.simulate(oracle, "submitReportData", [currentReport, await client.read(oracle, "getContractVersion")], {
        from: stranger,
      }),
      customError("SenderNotAllowed()"),
    );
    await expectRevert(
      client.simulate(
        oracle,
        "submitConsensusReport",
        [accountingReportHash(currentReport), currentReport.refSlot, BigInt(await client.getChainTime())],
        { from: stranger },
      ),
      customError("SenderIsNotTheConsensusContract()"),
    );
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [currentReport.refSlot], { from: stranger }),
      customError("SenderIsNotTheConsensusContract()"),
    );
  });

  it("rejects invalid consensus reports", async function () {
    const last = await ensureProcessing();
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last - 1n, BigInt(await client.getChainTime())], {
        from: consensus.address,
      }),
      customError("RefSlotCannotDecrease(uint256,uint256)", [last - 1n, last]),
    );
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last, BigInt(await client.getChainTime())], {
        from: consensus.address,
      }),
      customError("RefSlotMustBeGreaterThanProcessingOne(uint256,uint256)", [last, last]),
    );
    await expectRevert(
      client.simulate(oracle, "submitConsensusReport", [nonZeroHash, last + 1n, 42n], { from: consensus.address }),
      customError("ProcessingDeadlineMissed(uint256)", [42n]),
    );
    await expectRevert(
      client.simulate(
        oracle,
        "submitConsensusReport",
        [zeroHash, last + 1n, BigInt(await client.getChainTime()) + 3n],
        { from: consensus.address },
      ),
      customError("HashCannotBeZero()"),
    );
  });

  it("rejects discarding older or processing consensus reports", async function () {
    const last = await ensureProcessing();
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [last - 1n], { from: consensus.address }),
      customError("RefSlotCannotDecrease(uint256,uint256)", [last - 1n, last]),
    );
    await expectRevert(
      client.simulate(oracle, "discardConsensusReport", [last], { from: consensus.address }),
      customError("RefSlotAlreadyProcessing()"),
    );
  });

  it("rejects setting the same consensus version", async function () {
    await impersonated.impersonate(client, agent);
    await client.write(oracle, "grantRole", [await client.read(oracle, "MANAGE_CONSENSUS_VERSION_ROLE"), agent], {
      from: agent,
    });
    await expectRevert(
      client.simulate(oracle, "setConsensusVersion", [await client.read(oracle, "getConsensusVersion")], {
        from: agent,
      }),
      customError("VersionCannotBeSame()"),
    );
  });

  it("rejects invalid consensus contracts", async function () {
    await impersonated.impersonate(client, agent);
    await client.write(oracle, "grantRole", [await client.read(oracle, "MANAGE_CONSENSUS_CONTRACT_ROLE"), agent], {
      from: agent,
    });
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [zeroAddress], { from: agent }),
      customError("AddressCannotBeZero()"),
    );
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [consensus.address], { from: agent }),
      customError("AddressCannotBeSame()"),
    );
    const artifact = await hre.artifacts.readArtifact("MockHashConsensus");
    if (!isHex(artifact.bytecode)) {
      throw new Error("MockHashConsensus artifact has invalid bytecode");
    }
    const mock = { abi: artifact.abi, bytecode: artifact.bytecode };
    const mismatchedConsensusMock = await client.deployContract(
      { ...mock, args: [42n, 17n, 100500n, 0n] },
      { from: stranger },
    );
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [mismatchedConsensusMock], { from: agent }),
      customError("UnexpectedChainConfig()"),
    );
    const olderConsensusMock = await client.deployContract(
      {
        ...mock,
        args: [99n, await client.read(oracle, "SECONDS_PER_SLOT"), await client.read(oracle, "GENESIS_TIME"), 13n],
      },
      { from: stranger },
    );
    await expectRevert(
      client.simulate(oracle, "setConsensusContract", [olderConsensusMock], { from: agent }),
      customError("InitialRefSlotCannotBeLessThanProcessingOne(uint256,uint256)", [
        13n,
        await client.read(oracle, "getLastProcessingRefSlot"),
      ]),
    );
  });

  it("rejects finalizing the upgrade again", async function () {
    await expectRevert(
      client.simulate(oracle, "finalizeUpgrade_v5", [6n], { from: stranger }),
      customError("InvalidContractVersionIncrement()"),
    );
  });

  describe("submitReportExtraDataList", function () {
    it("rejects too short extra data items", async function () {
      await expectRevert(
        report(extraData([slice(extraDataItem(0, 2, 2, [2], [2n]), 0, 36)])),
        customError("InvalidExtraDataItem(uint256)", [0n]),
      );
      const count = await exited(2);
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2, 3, 4, 5], [count]), extraDataItem(1, 2, 2, [2], [count])])),
        customError("InvalidExtraDataItem(uint256)", [0n]),
      );
    });
    it("rejects zero node operator count", async function () {
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 2, [], [1n])])),
        customError("InvalidExtraDataItem(uint256)", [0n]),
      );
    });
    it("rejects zero module IDs", async function () {
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 0, [2], [1n]), extraDataItem(1, 2, 0, [2], [2n])])),
        customError("InvalidExtraDataItem(uint256)", [0n]),
      );
    });
    it("rejects unexpected extra data indices", async function () {
      await expectRevert(
        report(extraData([extraDataItem(1, 2, 1, [2], [1n]), extraDataItem(2, 2, 2, [2], [1n])])),
        customError("UnexpectedExtraDataIndex(uint256,uint256)", [0n, 1n]),
      );
      const count = await exited(2);
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2], [count]), extraDataItem(3, 2, 1, [2], [count])])),
        customError("UnexpectedExtraDataIndex(uint256,uint256)", [1n, 3n]),
      );
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [2], [count]), extraDataItem(0, 2, 1, [2], [count])])),
        customError("UnexpectedExtraDataIndex(uint256,uint256)", [1n, 0n]),
      );
    });
    it("rejects unsupported extra data types", async function () {
      await expectRevert(
        report(extraData([extraDataItem(0, 3, 1, [1], [1n])]), 1n),
        customError("UnsupportedExtraDataType(uint256,uint256)", [0n, 3n]),
      );
    });
    it("rejects duplicate items", async function () {
      const operator = client.getNetworkName() === "hoodi" ? 0 : 2;
      const count = (await exited(operator)) + 1n;
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, [operator], [count]), extraDataItem(1, 2, 1, [operator], [count])])),
        customError("InvalidExtraDataSortOrder(uint256)", [1n]),
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
        customError("InvalidExtraDataSortOrder(uint256)", [1n]),
      );
    });
    it("rejects unsorted exited operators", async function () {
      const ids = [33, 35, 34];
      const counts = await Promise.all(ids.map(async (id) => (await exited(id)) + 1n));
      await expectRevert(
        report(extraData([extraDataItem(0, 2, 1, ids, counts)])),
        customError("InvalidExtraDataSortOrder(uint256)", [0n]),
      );
    });
    it("rejects unexpected extra data item count", async function () {
      const ids = [2, 4, 5, 6, 7, 9, 10, 11];
      const increase = client.getNetworkName() === "hoodi" ? 0n : 1n;
      const items = await Promise.all(
        ids.map(async (id, index) => extraDataItem(index, 2, 1, [id], [(await exited(id)) + increase])),
      );
      await expectRevert(
        report(extraData(items), 7n),
        customError("UnexpectedExtraDataItemsCount(uint256,uint256)", [7n, 8n]),
      );
    });
    it("rejects already processed extra data", async function () {
      const operator = client.getNetworkName() === "hoodi" ? 0 : 33;
      await report(extraData([extraDataItem(0, 2, 1, [operator], [(await exited(operator)) + 1n])]), 1n);
      await expectRevert(
        sendAsFirstMember(
          oracle.address,
          encodeFunctionData({ abi: AccountingOracle_ABI, functionName: "submitReportExtraDataList", args: ["0x"] }),
        ),
        customError("ExtraDataAlreadyProcessed()"),
      );
    });
  });

  describe("submitReportData", function () {
    it("rejects invalid versions, reference slots, hashes, repeated data and missed deadlines", async function () {
      const currentReport = await prepareReport();
      const deadline = await pushReport(currentReport);
      const version = await client.read(oracle, "getContractVersion");
      await expectRevert(
        submitData(currentReport, 42n),
        customError("UnexpectedContractVersion(uint256,uint256)", [version, 42n]),
      );
      await expectRevert(
        submitData({ ...currentReport, refSlot: 42n }, version),
        customError("UnexpectedRefSlot(uint256,uint256)", [currentReport.refSlot, 42n]),
      );
      await expectRevert(
        submitData({ ...currentReport, consensusVersion: 66n }, version),
        customError("UnexpectedConsensusVersion(uint256,uint256)", [currentReport.consensusVersion, 66n]),
      );
      const broken = { ...currentReport, simulatedShareRate: 0n };
      await expectRevert(
        submitData(broken, version),
        customError("UnexpectedDataHash(bytes32,bytes32)", [
          accountingReportHash(currentReport),
          accountingReportHash(broken),
        ]),
      );
      await submitData(currentReport, version);
      await expectRevert(submitData(currentReport, version), customError("RefSlotAlreadyProcessing()"));
      await client.setTime(deadline + 42n);
      await expectRevert(
        submitData(currentReport, version),
        customError("ProcessingDeadlineMissed(uint256)", [deadline]),
      );
    });
    it("rejects inconsistent extra data metadata", async function () {
      const version = await client.read(oracle, "getContractVersion");
      let currentReport = await prepareReport({ extraDataHash: nonZeroHash });
      await pushReport(currentReport);
      await expectRevert(
        submitData(currentReport, version),
        customError("UnexpectedExtraDataHash(bytes32,bytes32)", [zeroHash, nonZeroHash]),
      );
      currentReport = await prepareReport({ extraDataItemsCount: 42n });
      await pushReport(currentReport);
      await expectRevert(
        submitData(currentReport, version),
        customError("UnexpectedExtraDataItemsCount(uint256,uint256)", [0n, 42n]),
      );
      currentReport = await prepareReport({ extraDataFormat: 66n });
      await pushReport(currentReport);
      await expectRevert(submitData(currentReport, version), customError("UnsupportedExtraDataFormat(uint256)", [66n]));
      currentReport = await prepareReport({ extraDataFormat: 1n });
      await pushReport(currentReport);
      await expectRevert(
        submitData(currentReport, version),
        customError("ExtraDataItemsCountCannotBeZeroForNonEmptyData()"),
      );
      currentReport = await prepareReport({ extraDataFormat: 1n, extraDataItemsCount: 42n });
      await pushReport(currentReport);
      await expectRevert(submitData(currentReport, version), customError("ExtraDataHashCannotBeZeroForNonEmptyData()"));
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
        const currentReport = await prepareReport({
          stakingModuleIdsWithNewlyExitedValidators: modules,
          numExitedValidatorsByStakingModule: counts,
        });
        await pushReport(currentReport);
        await expectRevert(submitData(currentReport, version), customError("InvalidExitedValidatorsData()"));
      }
    });
  });
});
