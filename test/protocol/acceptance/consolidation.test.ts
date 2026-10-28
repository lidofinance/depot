import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  keccak256,
  parseAbi,
  toHex,
  zeroHash,
} from "viem";
import { LidoLocator_ABI } from "@/abi/LidoLocator.abi";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const accessControl = [
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role, uint256 index) view returns (address)",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error InvalidInitialization()",
] as const;
const gatewayAbi = parseAbi([
  ...accessControl,
  "function GI_FIRST_VALIDATOR_PREV() view returns (bytes32)",
  "function GI_FIRST_VALIDATOR_CURR() view returns (bytes32)",
  "function PIVOT_SLOT() view returns (uint64)",
  "function getConsolidationRequestLimitFullInfo() view returns (uint256, uint256, uint256, uint256, uint256)",
  "function isPaused() view returns (bool)",
  "function addConsolidationRequests((bytes[] sourcePubkeys, (bytes32[] proof, bytes pubkey, uint256 validatorIndex, uint64 childBlockTimestamp, uint64 slot, uint64 proposerIndex) targetWitness)[] groups, address refundRecipient) payable",
  "function pauseFor(uint256 duration)",
  "function resume()",
  "function setConsolidationRequestLimit(uint256 maxRequests, uint256 requestsPerFrame, uint256 frameDuration)",
]);
const busAbi = parseAbi([
  ...accessControl,
  "function getConsolidationGateway() view returns (address)",
  "function batchSize() view returns (uint256)",
  "function maxGroupsInBatch() view returns (uint256)",
  "function executionDelay() view returns (uint256)",
  "function initialize(address admin, uint256 batchSize, uint256 maxGroups, uint256 delay)",
  "function addConsolidationRequests((bytes[] sourcePubkeys, bytes targetPubkey)[] groups)",
  "function removeBatches(bytes32[] batchHashes)",
  "function setBatchSize(uint256 limit)",
  "function setMaxGroupsInBatch(uint256 limit)",
  "function setExecutionDelay(uint256 delay)",
]);
const migratorAbi = parseAbi([
  ...accessControl,
  "function getStakingRouter() view returns (address)",
  "function getConsolidationBus() view returns (address)",
  "function sourceModuleId() view returns (uint256)",
  "function targetModuleId() view returns (uint256)",
  "function initialize(address admin)",
  "function allowPair(uint256 sourceOperatorId, uint256 targetOperatorId, address submitter)",
  "function disallowPair(uint256 sourceOperatorId, uint256 targetOperatorId)",
]);

const configurations = {
  mainnet: {
    gateway: "0x17be979344f2c2cC806229a532D92f8742C10462",
    bus: "0xd907CE33B4Be423823d1CFFe80BD147E8b8554C8",
    busImplementation: "0xFfDe8Acab9D7037f29198Ad03ad6d05bac8B0a2E",
    migrator: "0x9Dc70b5A4f4F5E4AF9058C983D560564F031f1D7",
    migratorImplementation: "0x6Fb4c152F092373dD71f0C07C83c1E77406599aB",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    circuitBreaker: "0x6019CB557978296BA3C08a7B73225C0975DFB2F7",
    resealManager: "0x7914b5a1539b97Bd0bbd155757F25FD79A522d24",
    committee: "0x2570e0b22AD904501dfB0d49575991ACB801dD91",
    easyTrackExecutor: "0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977",
    batchSize: 200n,
    sourceModuleId: 1n,
    curatedModuleId: 1n,
    targetModuleId: 4n,
    curatedV2ModuleId: 4n,
  },
  hoodi: {
    gateway: "0xC9991Bb865d025364BCbBd99f36e85889Fb68e69",
    bus: "0xe09fBcE63826468867eE66Eda491E444829E022A",
    busImplementation: "0x2908c4B32548D8799fDc601C1a75E7d5C2FbC556",
    migrator: "0x747d357F5b6410B80Eb63406FaC5E2A91131B4f8",
    migratorImplementation: "0x8BF11ead77fFe142AB27BE486Bc5aB22D9baF520",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    circuitBreaker: "0x44a5789dFeDa59cD176Ab5709ec2F4829dE4d555",
    resealManager: "0x05172CbCDb7307228F781436b327679e4DAE166B",
    committee: "0x84DffcfB232594975C608DE92544Ff239a24c9E9",
    easyTrackExecutor: "0x79a20FD0FA36453B2F45eAbab19bfef43575Ba9E",
    batchSize: 200n,
    sourceModuleId: 1n,
    curatedModuleId: 1n,
    targetModuleId: 5n,
    curatedV2ModuleId: 5n,
  },
} as const;

const firstValidator = "0x0000000000000000000000000000000000000000000000000096000000000028";
const limits = { maxRequests: 2900n, perFrame: 1n, frameDuration: 30n, maxGroups: 10n, executionDelay: 86400n };
const stranger = "0x000000000000000000000000000000000000bEEF";

function revertedWith(error: unknown, data: Hex): boolean {
  const revert =
    error instanceof BaseError &&
    error.walk(
      (cause) =>
        cause instanceof ContractFunctionRevertedError ||
        (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
    );
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.raw === data;
  }
  return revert instanceof Error && "data" in revert && revert.data === data;
}

function unauthorized(name: string): (error: unknown) => boolean {
  const data = encodeErrorResult({
    abi: gatewayAbi,
    errorName: "AccessControlUnauthorizedAccount",
    args: [stranger, keccak256(toHex(name))],
  });
  return (error: unknown) => revertedWith(error, data);
}

describe("Consolidation acceptance", function () {
  let client: DevRpcClient;
  let gateway: Contract<typeof gatewayAbi>;
  let bus: Contract<typeof busAbi>;
  let migrator: Contract<typeof migratorAbi>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    governance = getGovernanceContracts(network);
    gateway = contract(gatewayAbi, expected.gateway);
    bus = contract(busAbi, expected.bus);
    migrator = contract(migratorAbi, expected.migrator);
  });

  describe("gateway", function () {
    it("has the expected locator wiring and immutable beacon parameters", async function () {
      assert.equal(
        (await client.read(contract(LidoLocator_ABI, expected.locator), "consolidationGateway")).toLowerCase(),
        gateway.address.toLowerCase(),
        "locator consolidation gateway",
      );
      assert.equal(await client.read(gateway, "GI_FIRST_VALIDATOR_PREV"), firstValidator, "previous validator gindex");
      assert.equal(await client.read(gateway, "GI_FIRST_VALIDATOR_CURR"), firstValidator, "current validator gindex");
      assert.equal(await client.read(gateway, "PIVOT_SLOT"), 0n, "pivot slot");
    });

    it("has the expected request limits and is resumed", async function () {
      const [maxRequests, perFrame, frameDuration, , currentLimit] = await client.read(
        gateway,
        "getConsolidationRequestLimitFullInfo",
      );
      assert.equal(maxRequests, limits.maxRequests, "max requests");
      assert.equal(perFrame, limits.perFrame, "requests per frame");
      assert.equal(frameDuration, limits.frameDuration, "frame duration");
      assert.isTrue(currentLimit <= maxRequests, "current request limit");
      assert.isFalse(await client.read(gateway, "isPaused"), "paused");
    });

    it("has exactly the expected role holders", async function () {
      for (const [name, members] of [
        ["DEFAULT_ADMIN_ROLE", [expected.agent]],
        ["PAUSE_ROLE", [expected.circuitBreaker, expected.resealManager]],
        ["RESUME_ROLE", [expected.resealManager]],
        ["ADD_CONSOLIDATION_REQUEST_ROLE", [expected.bus]],
        ["EXIT_LIMIT_MANAGER_ROLE", []],
      ] as const) {
        const role = name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(name));
        assert.equal(await client.read(gateway, "getRoleMemberCount", [role]), BigInt(members.length), `${name} count`);
        const actual = await Promise.all(
          members.map((_, index) => client.read(gateway, "getRoleMember", [role, BigInt(index)])),
        );
        assert.sameMembers(
          actual.map((address) => address.toLowerCase()),
          members.map((address) => address.toLowerCase()),
          name,
        );
      }
    });

    it("rejects unauthorized requests, pauses, resumes and limit changes", async function () {
      await rejects(
        client.simulate(gateway, "addConsolidationRequests", [[], stranger], { from: stranger }),
        unauthorized("ADD_CONSOLIDATION_REQUEST_ROLE"),
      );
      await rejects(client.simulate(gateway, "pauseFor", [1n], { from: stranger }), unauthorized("PAUSE_ROLE"));
      await rejects(client.simulate(gateway, "resume", [], { from: stranger }), unauthorized("RESUME_ROLE"));
      await rejects(
        client.simulate(gateway, "setConsolidationRequestLimit", [1n, 1n, 1n], { from: stranger }),
        unauthorized("EXIT_LIMIT_MANAGER_ROLE"),
      );
    });
  });

  describe("bus", function () {
    it("has the expected proxy implementation and admin", async function () {
      const proxy = contract(OssifiableProxy_ABI, bus.address);
      assert.equal(
        (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
        expected.busImplementation.toLowerCase(),
        "implementation",
      );
      assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.agent.toLowerCase(), "admin");
    });

    it("has the expected gateway, batch size, group limit and execution delay", async function () {
      assert.equal(
        (await client.read(bus, "getConsolidationGateway")).toLowerCase(),
        expected.gateway.toLowerCase(),
        "gateway",
      );
      assert.equal(await client.read(bus, "batchSize"), expected.batchSize, "batch size");
      assert.equal(await client.read(bus, "maxGroupsInBatch"), limits.maxGroups, "max groups");
      assert.equal(await client.read(bus, "executionDelay"), limits.executionDelay, "execution delay");
    });

    it("cannot initialize the proxy or petrified implementation again", async function () {
      const data = encodeErrorResult({ abi: busAbi, errorName: "InvalidInitialization" });
      for (const target of [bus, contract(busAbi, expected.busImplementation)]) {
        await rejects(
          client.simulate(
            target,
            "initialize",
            [expected.agent, expected.batchSize, limits.maxGroups, limits.executionDelay],
            { from: governance.voting.address },
          ),
          (error: unknown) => revertedWith(error, data),
          `initialize ${target.address}`,
        );
      }
    });

    it("has exactly the expected role holders", async function () {
      for (const [name, members] of [
        ["DEFAULT_ADMIN_ROLE", [expected.agent]],
        ["PUBLISH_ROLE", [expected.migrator]],
        ["REMOVE_ROLE", [expected.committee]],
        ["MANAGE_ROLE", []],
      ] as const) {
        const role = name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(name));
        assert.equal(await client.read(bus, "getRoleMemberCount", [role]), BigInt(members.length), `${name} count`);
        const actual = await Promise.all(
          members.map((_, index) => client.read(bus, "getRoleMember", [role, BigInt(index)])),
        );
        assert.sameMembers(
          actual.map((address) => address.toLowerCase()),
          members.map((address) => address.toLowerCase()),
          name,
        );
      }
    });

    it("rejects unauthorized publishing, removals and configuration changes", async function () {
      await rejects(
        client.simulate(bus, "addConsolidationRequests", [[]], { from: stranger }),
        unauthorized("PUBLISH_ROLE"),
      );
      await rejects(client.simulate(bus, "removeBatches", [[]], { from: stranger }), unauthorized("REMOVE_ROLE"));
      await rejects(client.simulate(bus, "setBatchSize", [1n], { from: stranger }), unauthorized("MANAGE_ROLE"));
      await rejects(client.simulate(bus, "setMaxGroupsInBatch", [1n], { from: stranger }), unauthorized("MANAGE_ROLE"));
      await rejects(client.simulate(bus, "setExecutionDelay", [1n], { from: stranger }), unauthorized("MANAGE_ROLE"));
    });
  });

  describe("migrator", function () {
    it("has the expected proxy implementation and admin", async function () {
      const proxy = contract(OssifiableProxy_ABI, migrator.address);
      assert.equal(
        (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
        expected.migratorImplementation.toLowerCase(),
        "implementation",
      );
      assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.agent.toLowerCase(), "admin");
    });

    it("has the expected router, bus and source and target module IDs", async function () {
      assert.equal(
        (await client.read(migrator, "getStakingRouter")).toLowerCase(),
        expected.stakingRouter.toLowerCase(),
        "staking router",
      );
      assert.equal(
        (await client.read(migrator, "getConsolidationBus")).toLowerCase(),
        expected.bus.toLowerCase(),
        "bus",
      );
      assert.equal(
        await client.read(migrator, "sourceModuleId"),
        expected.sourceModuleId,
        "consolidation source module",
      );
      assert.equal(await client.read(migrator, "sourceModuleId"), expected.curatedModuleId, "Curated source module");
      assert.equal(
        await client.read(migrator, "targetModuleId"),
        expected.targetModuleId,
        "consolidation target module",
      );
      assert.equal(
        await client.read(migrator, "targetModuleId"),
        expected.curatedV2ModuleId,
        "Curated v2 target module",
      );
    });

    it("cannot initialize the proxy or petrified implementation again", async function () {
      const data = encodeErrorResult({ abi: migratorAbi, errorName: "InvalidInitialization" });
      for (const target of [migrator, contract(migratorAbi, expected.migratorImplementation)]) {
        await rejects(
          client.simulate(target, "initialize", [expected.agent], { from: governance.voting.address }),
          (error: unknown) => revertedWith(error, data),
          `initialize ${target.address}`,
        );
      }
    });

    it("has exactly the expected role holders", async function () {
      for (const [name, members] of [
        ["DEFAULT_ADMIN_ROLE", [expected.agent]],
        ["ALLOW_PAIR_ROLE", [expected.easyTrackExecutor]],
        ["DISALLOW_PAIR_ROLE", [expected.committee]],
      ] as const) {
        const role = name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(name));
        assert.equal(
          await client.read(migrator, "getRoleMemberCount", [role]),
          BigInt(members.length),
          `${name} count`,
        );
        const actual = await Promise.all(
          members.map((_, index) => client.read(migrator, "getRoleMember", [role, BigInt(index)])),
        );
        assert.sameMembers(
          actual.map((address) => address.toLowerCase()),
          members.map((address) => address.toLowerCase()),
          name,
        );
      }
    });

    it("rejects unauthorized pair approvals and removals", async function () {
      await rejects(
        client.simulate(migrator, "allowPair", [1n, 1n, stranger], { from: stranger }),
        unauthorized("ALLOW_PAIR_ROLE"),
      );
      await rejects(
        client.simulate(migrator, "disallowPair", [1n, 1n], { from: stranger }),
        unauthorized("DISALLOW_PAIR_ROLE"),
      );
    });
  });
});
