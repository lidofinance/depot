import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  type Address,
  BaseError,
  type ContractFunctionArgs,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  getAbiItem,
  type Hex,
  keccak256,
  numberToHex,
  parseAbi,
  parseEther,
  concatHex,
  sliceHex,
} from "viem";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { ValidatorsExitBusOracle_ABI } from "@/abi/ValidatorsExitBusOracle.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";

const delegationAbi = parseAbi([
  "function getDelegate() view returns (address)",
  "function execute(address target, bytes data) returns (bytes)",
]);
const configurations = {
  mainnet: {
    oracle: "0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e",
    consensus: "0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
    registry: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
  },
  hoodi: {
    oracle: "0x8664d394C2B3278F26A1B44B967aEf99707eeAB2",
    consensus: "0x30308CD8844fb2DB3ec4D056F1d475a802DCA07c",
    registry: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
  },
} as const;
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
  let refSlot: bigint;
  let contractVersion: bigint;
  let consensusVersion: bigint;

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    const addresses = configurations[network];
    oracle = contract(ValidatorsExitBusOracle_ABI, addresses.oracle);
    consensus = contract(HashConsensus_ABI, addresses.consensus);
    registry = contract(NodeOperatorsRegistry_ABI, addresses.registry);
  });

  beforeEach(async function () {
    snapshot = await client.snapshot();
    const [slotsPerEpoch, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
    const [, epochsPerFrame] = await client.read(consensus, "getFrameConfig");
    const [previousRefSlot] = await client.read(consensus, "getCurrentFrame");
    const nextRefSlot = previousRefSlot + slotsPerEpoch * epochsPerFrame;
    await client.setTime(genesisTime + (nextRefSlot + 1n) * secondsPerSlot);
    [refSlot] = await client.read(consensus, "getCurrentFrame");
    assert.equal(refSlot, nextRefSlot, "next reporting frame");
    contractVersion = await client.read(oracle, "getContractVersion");
    consensusVersion = await client.read(oracle, "getConsensusVersion");
  });

  afterEach(async function () {
    await client.revert(snapshot);
  });

  async function sendAsMember(member: Address, target: Address, data: Hex, call = false) {
    let sender = member;
    if (await client.viemClient.getCode({ address: member })) {
      sender = await client.read(contract(delegationAbi, member), "getDelegate");
      data = encodeFunctionData({ abi: delegationAbi, functionName: "execute", args: [target, data] });
      target = member;
    }
    await client.impersonate(sender, parseEther("10"));
    try {
      if (call) {
        return await client.viemClient.call({ account: sender, to: target, data });
      }
      const hash = await client.viemClient.sendTransaction({
        account: sender,
        to: target,
        data,
        chain: client.viemClient.chain,
      });
      const receipt = await client.viemClient.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
      return receipt;
    } finally {
      await client.stopImpersonating(sender);
    }
  }

  async function reachConsensus(report: Report): Promise<Address> {
    const hash = reportHash(report);
    const [members] = await client.read(consensus, "getFastLaneMembers");
    assert.isNotEmpty(members);
    for (const member of members) {
      await sendAsMember(
        member,
        consensus.address,
        encodeFunctionData({
          abi: HashConsensus_ABI,
          functionName: "submitReport",
          args: [refSlot, hash, consensusVersion],
        }),
      );
    }
    const [, actualHash] = await client.read(consensus, "getConsensusState");
    assert.equal(actualHash, hash, "consensus report hash");
    return members[0];
  }

  function submit(member: Address, report: Report, version = contractVersion, call = true) {
    return sendAsMember(
      member,
      oracle.address,
      encodeFunctionData({
        abi: ValidatorsExitBusOracle_ABI,
        functionName: "submitReportData",
        args: [report, version],
      }),
      call,
    );
  }

  async function expectRevert(action: Promise<unknown>, expected: Hex) {
    await rejects(action, (error: unknown) => {
      const revert =
        error instanceof BaseError &&
        error.walk((cause) => cause instanceof Error && "data" in cause && typeof cause.data === "string");
      return revert instanceof Error && "data" in revert && revert.data === expected;
    });
  }

  function emptyReport(): Report {
    return { consensusVersion, refSlot, requestsCount: 0n, dataFormat: 2n, data: "0x" };
  }

  it("rejects unauthorized senders, wrong versions, reference slots and data hashes", async function () {
    const report = emptyReport();
    const member = await reachConsensus(report);
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
    const member = await reachConsensus(report);
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
    const member = await reachConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "UnsupportedRequestsDataFormat", args: [3n] }),
    );
  });

  it("rejects an invalid packed data length", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), requestsCount: 1n, data: sliceHex(request(1n, 1n, 1n, 1n, key), 0, 30) };
    const member = await reachConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "InvalidRequestsDataLength" }),
    );
  });

  it("rejects a request count inconsistent with the packed data", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), data: request(1n, 1n, 1n, 1n, key) };
    const member = await reachConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "UnexpectedRequestsDataLength" }),
    );
  });

  it("rejects module ID zero", async function () {
    const [key] = await client.read(registry, "getSigningKey", [1n, 1n]);
    const report = { ...emptyReport(), requestsCount: 1n, data: request(0n, 1n, 1n, 1n, key) };
    const member = await reachConsensus(report);
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
    const member = await reachConsensus(report);
    await expectRevert(
      submit(member, report),
      encodeErrorResult({ abi: ValidatorsExitBusOracle_ABI, errorName: "InvalidRequestsDataSortOrder" }),
    );
  });
});
