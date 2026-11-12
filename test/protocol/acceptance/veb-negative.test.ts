import { assert } from "chai";

import {
  type Address,
  type ContractFunctionArgs,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  getAbiItem,
  type Hex,
  keccak256,
  numberToHex,
  concatHex,
  sliceHex,
} from "viem";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { ValidatorsExitBusOracle_ABI } from "@/abi/ValidatorsExitBusOracle.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { expectRevert } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import {
  advanceToNextFrame,
  callAsOracleMember,
  reachConsensus,
  sendAsOracleMember,
} from "@/test/protocol/helpers/oracle";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

type Report = ContractFunctionArgs<typeof ValidatorsExitBusOracle_ABI, "nonpayable", "submitReportData">[0];

function reportHash(report: Report): Hex {
  const { inputs } = getAbiItem({ abi: ValidatorsExitBusOracle_ABI, name: "submitReportData" });
  return keccak256(encodeAbiParameters([inputs[0]], [report]));
}

function request(moduleId: bigint, operatorId: bigint, validatorIndex: bigint, keyIndex: bigint, key: Hex): Hex {
  return concatHex([
    numberToHex(moduleId, { size: 3 }),
    numberToHex(operatorId, { size: 5 }),
    numberToHex(validatorIndex, { size: 8 }),
    numberToHex(keyIndex, { size: 8 }),
    key,
  ]);
}

describe("ValidatorsExitBusOracle negative acceptance", function () {
  let client: DevRpcClient;
  let oracle: Contract<typeof ValidatorsExitBusOracle_ABI>;
  let consensus: Contract<typeof HashConsensus_ABI>;
  let registry: Contract<typeof NodeOperatorsRegistry_ABI>;
  let snapshot: Hex;
  const impersonated = new ImpersonatedAccounts();
  let refSlot: bigint;
  let contractVersion: bigint;
  let consensusVersion: bigint;

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    const { locator } = getGovernanceContracts(network);
    oracle = contract(ValidatorsExitBusOracle_ABI, await client.read(locator, "validatorsExitBusOracle"));
    consensus = contract(HashConsensus_ABI, await client.read(oracle, "getConsensusContract"));
    const router = contract(StakingRouter_ABI, await client.read(locator, "stakingRouter"));
    registry = contract(
      NodeOperatorsRegistry_ABI,
      (await client.read(router, "getStakingModule", [1n])).stakingModuleAddress,
    );
  });

  beforeEach(async function () {
    snapshot = await client.snapshot();
    refSlot = await advanceToNextFrame(client, consensus);
    contractVersion = await client.read(oracle, "getContractVersion");
    consensusVersion = await client.read(oracle, "getConsensusVersion");
  });

  afterEach(async function () {
    try {
      await impersonated.stopAll(client);
    } finally {
      await client.revert(snapshot);
    }
  });

  async function reachReportConsensus(report: Report): Promise<Address> {
    const [member] = await reachConsensus(
      client,
      impersonated,
      consensus,
      refSlot,
      reportHash(report),
      consensusVersion,
    );
    return member;
  }

  function submit(member: Address, report: Report, version = contractVersion, call = true) {
    const data = encodeFunctionData({
      abi: ValidatorsExitBusOracle_ABI,
      functionName: "submitReportData",
      args: [report, version],
    });
    return call
      ? callAsOracleMember(client, impersonated, member, oracle.address, data)
      : sendAsOracleMember(client, impersonated, member, oracle.address, data);
  }

  function emptyReport(): Report {
    return { consensusVersion, refSlot, requestsCount: 0n, dataFormat: 2n, data: "0x" };
  }

  it("rejects unauthorized senders, wrong versions, reference slots and data hashes", async function () {
    const report = emptyReport();
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit("0x0000000000000000000000000000000000000703", report),
      encodeErrorResult({
        abi: ValidatorsExitBusOracle_ABI,
        errorName: "SenderNotAllowed",
      }),
    );
    await expectRevert(
      submit(member, report, contractVersion + 1n),
      encodeErrorResult({
        abi: ValidatorsExitBusOracle_ABI,
        errorName: "UnexpectedContractVersion",
        args: [contractVersion, contractVersion + 1n],
      }),
    );
    await expectRevert(
      submit(member, { ...report, refSlot: refSlot - 1n }),
      encodeErrorResult({
        abi: ValidatorsExitBusOracle_ABI,
        errorName: "UnexpectedRefSlot",
        args: [refSlot, refSlot - 1n],
      }),
    );
    await expectRevert(
      submit(member, { ...report, consensusVersion: consensusVersion + 1n }),
      encodeErrorResult({
        abi: ValidatorsExitBusOracle_ABI,
        errorName: "UnexpectedConsensusVersion",
        args: [consensusVersion, consensusVersion + 1n],
      }),
    );
    const wrongReport = { ...report, data: "0x2a" } as const;
    await expectRevert(
      submit(member, wrongReport),
      encodeErrorResult({
        abi: ValidatorsExitBusOracle_ABI,
        errorName: "UnexpectedDataHash",
        args: [reportHash(report), reportHash(wrongReport)],
      }),
    );
  });

  it("processes an agreed report and rejects processing it twice", async function () {
    const report = emptyReport();
    const member = await reachReportConsensus(report);
    await submit(member, report, contractVersion, false);
    assert.isTrue((await client.read(oracle, "getProcessingState")).dataSubmitted);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "RefSlotAlreadyProcessing" }),
    );
  });

  it("rejects unsupported request formats", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), requestsCount: 1n, dataFormat: 3n, data: request(1n, 1n, 1n, 1n, key) };
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "UnsupportedRequestsDataFormat", args: [3n] }),
    );
  });

  it("rejects an invalid packed data length", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), requestsCount: 1n, data: sliceHex(request(1n, 1n, 1n, 1n, key), 0, 30) };
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "InvalidRequestsDataLength" }),
    );
  });

  it("rejects a request count inconsistent with the packed data", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), data: request(1n, 1n, 1n, 1n, key) };
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "UnexpectedRequestsDataLength" }),
    );
  });

  it("rejects module ID zero", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), requestsCount: 1n, data: request(0n, 1n, 1n, 1n, key) };
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "InvalidModuleId" }),
    );
  });

  it("rejects requests out of validator index order after a valid first key", async function () {
    const operatorId = 33n;
    const [firstKey] = await client.read(registry, "getSigningKey", [operatorId, 1n]);
    const [secondKey] = await client.read(registry, "getSigningKey", [operatorId, 2n]);
    const report = {
      ...emptyReport(),
      requestsCount: 2n,
      data: concatHex([
        request(1n, operatorId, 100_000_001n, 2n, secondKey),
        request(1n, operatorId, 100_000_000n, 1n, firstKey),
      ]),
    };
    const member = await reachReportConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "InvalidRequestsDataSortOrder" }),
    );
  });
});
