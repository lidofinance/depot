import { assert } from "chai";
import { rejects } from "node:assert/strict";
import { keccak256, stringToHex, zeroAddress } from "viem";
import { AppProxyUpgradeable_ABI } from "@/abi/AppProxyUpgradeable.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { isRevertedWith, solidityError } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    registry: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
    implementation: "0x6828b023e737f96B168aCd0b5c6351971a4F81aE",
    operatorsCount: 39n,
    activeOperatorsCount: 35n,
    deactivatedOperators: [1n, 3n, 12n, 32n],
    targetLimits: [
      { id: 1n, mode: 1n, validatorsCount: 0n },
      { id: 3n, mode: 1n, validatorsCount: 0n },
      { id: 12n, mode: 1n, validatorsCount: 0n },
      { id: 21n, mode: 1n, validatorsCount: 0n },
      { id: 32n, mode: 1n, validatorsCount: 0n },
    ],
    zeroTargetOperators: [3n, 21n, 32n],
  },
  hoodi: {
    registry: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
    implementation: "0x95F00b016bB31b7182D96D25074684518246E42a",
    operatorsCount: 41n,
    activeOperatorsCount: 41n,
    deactivatedOperators: [],
    targetLimits: [
      { id: 0n, mode: 2n, validatorsCount: 97n },
      { id: 6n, mode: 2n, validatorsCount: 0n },
      { id: 7n, mode: 2n, validatorsCount: 0n },
      { id: 38n, mode: 1n, validatorsCount: 0n },
      { id: 39n, mode: 2n, validatorsCount: 125n },
    ],
    zeroTargetOperators: [6n, 7n, 38n],
  },
} as const;

const appId = "0x7071f283424072341f856ac9e947e7ec0eb68719f757a7e785979b6b8717579d";
const moduleType = stringToHex("curated-onchain-v1", { size: 32 });
const exitDeadline = 172800n;

describe("NodeOperatorsRegistry acceptance", function () {
  let client: DevRpcClient;
  let registry: Contract<typeof NodeOperatorsRegistry_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    registry = contract(NodeOperatorsRegistry_ABI, expected.registry);
    governance = getGovernanceContracts(network);
  });

  it("has the expected locator and Aragon application state", async function () {
    assert.equal(
      (await client.read(registry, "getLocator")).toLowerCase(),
      governance.locator.address.toLowerCase(),
      "locator",
    );
    const proxy = contract(AppProxyUpgradeable_ABI, registry.address);
    assert.equal(
      (await client.read(proxy, "implementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal(
      (await client.read(registry, "kernel")).toLowerCase(),
      governance.kernel.address.toLowerCase(),
      "kernel",
    );
    assert.equal(await client.read(registry, "appId"), appId, "Aragon app ID");
    assert.isTrue(await client.read(registry, "hasInitialized"), "initialized");
    assert.isFalse(await client.read(registry, "isPetrified"), "petrified proxy");
  });

  it("has the expected role hashes and contract version", async function () {
    for (const role of [
      "MANAGE_SIGNING_KEYS",
      "SET_NODE_OPERATOR_LIMIT_ROLE",
      "MANAGE_NODE_OPERATOR_ROLE",
      "STAKING_ROUTER_ROLE",
    ] as const) {
      assert.equal(await client.read(registry, role), keccak256(stringToHex(role)), role);
    }
    assert.equal(await client.read(registry, "getContractVersion"), 4n, "contract version");
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    const expectedRevert = solidityError("INIT_ALREADY_INITIALIZED");
    for (const target of [registry, contract(NodeOperatorsRegistry_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [governance.locator.address, moduleType, exitDeadline], {
          from: governance.voting.address,
        }),
        (error: unknown) => isRevertedWith(error, expectedRevert),
        `initialize ${target.address}`,
      );
    }
  });

  it("rejects repeated proxy upgrades and upgrades of the uninitialized implementation", async function () {
    for (const [target, reason] of [
      [registry, "UNEXPECTED_CONTRACT_VERSION"],
      [contract(NodeOperatorsRegistry_ABI, expected.implementation), "CONTRACT_NOT_INITIALIZED"],
    ] as const) {
      const expectedRevert = solidityError(reason);
      await rejects(
        client.simulate(target, "finalizeUpgrade_v4", [exitDeadline], { from: governance.voting.address }),
        (error: unknown) => isRevertedWith(error, expectedRevert),
        `finalizeUpgrade_v4 ${target.address}`,
      );
    }
  });

  it("has the expected module configuration and positive depositable count", async function () {
    assert.equal(await client.read(registry, "getNodeOperatorsCount"), expected.operatorsCount, "operator count");
    assert.equal(
      await client.read(registry, "getActiveNodeOperatorsCount"),
      expected.activeOperatorsCount,
      "active operator count",
    );
    assert.equal(await client.read(registry, "getStuckPenaltyDelay"), 0n, "stuck penalty delay");
    assert.equal(await client.read(registry, "getType"), moduleType, "module type");
    const [, , depositableValidatorsCount] = await client.read(registry, "getStakingModuleSummary");
    assert.isTrue(depositableValidatorsCount > 0n, "depositable validators");
  });

  it("retains the historical mainnet nonce and validator counters", async function () {
    if (client.getNetworkName() !== "mainnet") {
      this.skip();
    }
    assert.isTrue((await client.read(registry, "getNonce")) >= 7315n, "nonce");
    const [totalExitedValidators, totalDepositedValidators] = await client.read(registry, "getStakingModuleSummary");
    assert.isTrue(totalExitedValidators >= 145n, "exited validators");
    assert.isTrue(totalDepositedValidators >= 177397n, "deposited validators");
  });

  it("preserves every operator identity, activity state and validator-count invariant", async function () {
    for (let id = 0n; id < expected.operatorsCount; id++) {
      const [
        active,
        name,
        rewardAddress,
        totalVettedValidators,
        totalExitedValidators,
        totalAddedValidators,
        totalDepositedValidators,
      ] = await client.read(registry, "getNodeOperator", [id, true]);
      assert.equal(
        active,
        !expected.deactivatedOperators.some((operatorId) => operatorId === id),
        `operator ${id} activity`,
      );
      assert.isNotNull(name, `operator ${id} name`);
      assert.notEqual(name, "", `operator ${id} nonempty name`);
      assert.notEqual(rewardAddress, zeroAddress, `operator ${id} reward address`);
      assert.isTrue(totalExitedValidators >= 0n, `operator ${id} nonnegative exited validators`);
      assert.isTrue(totalExitedValidators <= totalDepositedValidators, `operator ${id} exited <= deposited validators`);
      assert.isTrue(totalDepositedValidators <= totalVettedValidators, `operator ${id} deposited <= vetted validators`);
      assert.isTrue(totalVettedValidators <= totalAddedValidators, `operator ${id} vetted <= added validators`);

      const [
        targetLimitMode,
        targetValidatorsCount,
        ,
        refundedValidatorsCount,
        ,
        summaryExitedValidators,
        summaryDepositedValidators,
        depositableValidatorsCount,
      ] = await client.read(registry, "getNodeOperatorSummary", [id]);
      const targetLimit = expected.targetLimits.find((limit) => limit.id === id);
      assert.equal(targetLimitMode, targetLimit?.mode ?? 0n, `operator ${id} target limit mode`);
      assert.equal(targetValidatorsCount, targetLimit?.validatorsCount ?? 0n, `operator ${id} target validator count`);
      assert.equal(refundedValidatorsCount, 0n, `operator ${id} refunded validators`);
      assert.isTrue(summaryExitedValidators >= 0n, `operator ${id} nonnegative summary exited validators`);
      assert.isTrue(
        summaryExitedValidators <= summaryDepositedValidators,
        `operator ${id} summary exited <= deposited validators`,
      );
      assert.isNotNull(depositableValidatorsCount, `operator ${id} depositable count`);
      assert.equal(totalExitedValidators, summaryExitedValidators, `operator ${id} exited summary matches`);
      assert.equal(totalDepositedValidators, summaryDepositedValidators, `operator ${id} deposited summary matches`);
      if (expected.zeroTargetOperators.some((operatorId) => operatorId === id)) {
        assert.equal(depositableValidatorsCount, 0n, `operator ${id} zero-target depositable count`);
      } else if (targetLimit && targetLimit.validatorsCount > 0n) {
        const targetMaximum = totalExitedValidators + targetLimit.validatorsCount;
        const maximum = totalVettedValidators < targetMaximum ? totalVettedValidators : targetMaximum;
        const depositable = maximum > totalDepositedValidators ? maximum - totalDepositedValidators : 0n;
        assert.equal(depositableValidatorsCount, depositable, `operator ${id} target-capped depositable count`);
      } else {
        assert.equal(
          depositableValidatorsCount,
          totalVettedValidators - totalDepositedValidators,
          `operator ${id} depositable count matches vetted minus deposited`,
        );
      }
    }
  });
});
