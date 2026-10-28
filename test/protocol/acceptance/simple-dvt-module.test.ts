import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
} from "viem";
import { AppProxyUpgradeable_ABI } from "@/abi/AppProxyUpgradeable.abi";
import { EasyTrack_ABI } from "@/abi/EasyTrack.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    simpleDvt: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433",
    implementation: "0x6828b023e737f96B168aCd0b5c6351971a4F81aE",
    kernel: "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    easyTrack: "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    easyTrackExecutor: "0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977",
    trustedCaller: "0x08637515E85A4633E23dfc7861e2A9f53af640f7",
    easyTrackSigningKeysPermission: true,
    factories: {
      AddNodeOperators: "0xcAa3AF7460E83E665EEFeC73a7a542E5005C9639",
      ActivateNodeOperators: "0xCBb418F6f9BFd3525CE6aADe8F74ECFEfe2DB5C8",
      DeactivateNodeOperators: "0x8B82C1546D47330335a48406cc3a50Da732672E7",
      SetVettedValidatorsLimits: "0xD75778b855886Fc5e1eA7D6bFADA9EB68b35C19D",
      SetNodeOperatorNames: "0x7d509BFF310d9460b1F613e4e40d342201a83Ae4",
      SetNodeOperatorRewardAddresses: "0x589e298964b9181D9938B84bB034C3BB9024E2C0",
      UpdateTargetValidatorLimits: "0x161a4552A625844c822954C5AcBac928ee0f399B",
      ChangeNodeOperatorManagers: "0xE31A0599A6772BCf9b2bFc9e25cf941e793c9a7D",
    },
  },
  hoodi: {
    simpleDvt: "0x0B5236BECA68004DB89434462DfC3BB074d2c830",
    implementation: "0x95F00b016bB31b7182D96D25074684518246E42a",
    kernel: "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    easyTrack: "0x284D91a7D47850d21A6DEaaC6E538AC7E5E6fc2a",
    easyTrackExecutor: "0x79a20FD0FA36453B2F45eAbab19bfef43575Ba9E",
    trustedCaller: "0xbB958292042c604855d23F8db458855d20e16996",
    // The Hoodi setup transferred role management without granting this role.
    easyTrackSigningKeysPermission: false,
    factories: {
      AddNodeOperators: "0x42f2532ab3d41dfD6030db1EC2fF3DBC8DCdf89a",
      ActivateNodeOperators: "0xfA3B3EE204E1f0f165379326768667300992530e",
      DeactivateNodeOperators: "0x3114bEbC222Faec27DF8AB7f9bD8dF2063d7fc77",
      SetVettedValidatorsLimits: "0x956c5dC6cfc8603b2293bF8399B718cbf61a9dda",
      SetNodeOperatorNames: "0x2F98760650922cf65f1b596635bC5835b6E561d4",
      SetNodeOperatorRewardAddresses: "0x3d267e4f8d9dCcc83c2DE66729e6A5B2B0856e31",
      UpdateTargetValidatorLimits: "0xc3975Bc4091B585c57357990155B071111d7f4f8",
      ChangeNodeOperatorManagers: "0x8a437cd5685e270cDDb347eeEfEbD22109Fa42a9",
    },
  },
} as const;

const factoryAbi = parseAbi([
  "function nodeOperatorsRegistry() view returns (address)",
  "function trustedCaller() view returns (address)",
]);
const errorAbi = parseAbi(["error Error(string)"]);
const moduleType = stringToHex("curated-onchain-v1", { size: 32 });
const deactivatedNodeOperators: readonly bigint[] = [];
const exitedNodeOperators: readonly bigint[] = [];
const roles = {
  STAKING_ROUTER_ROLE: "0xbb75b874360e0bfd87f964eadd8276d8efb7c942134fc329b513032d0803e0c6",
  MANAGE_NODE_OPERATOR_ROLE: "0x78523850fdd761612f46e844cf5a16bda6b3151d6ae961fd7e8e7b92bfbca7f8",
  SET_NODE_OPERATOR_LIMIT_ROLE: "0x07b39e0faf2521001ae4e58cb9ffd3840a63e205d288dc9c93c3774f0d794754",
  MANAGE_SIGNING_KEYS: "0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee",
} as const;

describe("SimpleDVT acceptance", function () {
  let client: DevRpcClient;
  let simpleDvt: Contract<typeof NodeOperatorsRegistry_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    simpleDvt = contract(NodeOperatorsRegistry_ABI, expected.simpleDvt);
    governance = getGovernanceContracts(network);
  });

  it("has the expected locator", async function () {
    assert.equal((await client.read(simpleDvt, "getLocator")).toLowerCase(), expected.locator.toLowerCase(), "locator");
  });

  it("has the expected Aragon proxy and initialization state", async function () {
    assert.equal(
      (await client.read(contract(AppProxyUpgradeable_ABI, simpleDvt.address), "implementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(simpleDvt, "kernel")).toLowerCase(), expected.kernel.toLowerCase(), "kernel");
    assert.equal(
      await client.read(simpleDvt, "appId"),
      "0xe1635b63b5f7b5e545f2a637558a4029dea7905361a2f0fc28c66e9136cf86a4",
      "app ID",
    );
    assert.isTrue(await client.read(simpleDvt, "hasInitialized"), "initialized proxy");
    assert.isFalse(await client.read(simpleDvt, "isPetrified"), "proxy petrification");
  });

  it("has the expected role hashes", async function () {
    for (const name of [
      "MANAGE_SIGNING_KEYS",
      "SET_NODE_OPERATOR_LIMIT_ROLE",
      "MANAGE_NODE_OPERATOR_ROLE",
      "STAKING_ROUTER_ROLE",
    ] as const) {
      assert.equal(await client.read(simpleDvt, name), keccak256(stringToHex(name)), name);
    }
  });

  it("has contract version four", async function () {
    assert.equal(await client.read(simpleDvt, "getContractVersion"), 4n, "contract version");
  });

  it("rejects proxy reinitialization and upgrade finalization with exact reasons", async function () {
    const implementation = contract(NodeOperatorsRegistry_ABI, expected.implementation);
    for (const [target, method, reason] of [
      [simpleDvt, "initialize", "INIT_ALREADY_INITIALIZED"],
      [simpleDvt, "finalizeUpgrade_v4", "UNEXPECTED_CONTRACT_VERSION"],
      [implementation, "initialize", "INIT_ALREADY_INITIALIZED"],
      [implementation, "finalizeUpgrade_v4", "CONTRACT_NOT_INITIALIZED"],
    ] as const) {
      const call =
        method === "initialize"
          ? client.simulate(target, method, [expected.locator, moduleType, 172800n], {
              from: governance.voting.address,
            })
          : client.simulate(target, method, [172800n], { from: governance.voting.address });
      const expectedRevert = encodeErrorResult({ abi: errorAbi, errorName: "Error", args: [reason] });
      await rejects(
        call,
        (error: unknown) => {
          const revert =
            error instanceof BaseError &&
            error.walk(
              (cause) =>
                cause instanceof ContractFunctionRevertedError ||
                (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
            );
          if (revert instanceof ContractFunctionRevertedError) {
            return revert.raw === expectedRevert;
          }
          return revert instanceof Error && "data" in revert && revert.data === expectedRevert;
        },
        `${target.address} ${method}: ${reason}`,
      );
    }
  });

  it("has valid module counters, type and deprecated penalty delay", async function () {
    assert.isTrue((await client.read(simpleDvt, "getNodeOperatorsCount")) >= 0n, "node operators count");
    assert.isTrue((await client.read(simpleDvt, "getActiveNodeOperatorsCount")) >= 0n, "active node operators count");
    assert.isTrue((await client.read(simpleDvt, "getNonce")) >= 0n, "nonce");
    assert.equal(await client.read(simpleDvt, "getStuckPenaltyDelay"), 0n, "stuck penalty delay");
    assert.equal(await client.read(simpleDvt, "getType"), moduleType, "module type");
    const [totalExitedValidators, totalDepositedValidators, depositableValidatorsCount] = await client.read(
      simpleDvt,
      "getStakingModuleSummary",
    );
    assert.isTrue(totalExitedValidators >= 0n, "total exited validators");
    assert.isTrue(totalDepositedValidators >= 0n, "total deposited validators");
    assert.isTrue(depositableValidatorsCount >= 0n, "depositable validators count");
  });

  it("preserves every node operator state and depositability invariant", async function () {
    const count = await client.read(simpleDvt, "getNodeOperatorsCount");
    for (let id = 0n; id < count; id++) {
      const [
        active,
        name,
        rewardAddress,
        totalVettedValidators,
        totalExitedValidators,
        totalAddedValidators,
        totalDepositedValidators,
      ] = await client.read(simpleDvt, "getNodeOperator", [id, true]);
      assert.equal(active, !deactivatedNodeOperators.includes(id), `operator ${id} active`);
      assert.isNotNull(name, `operator ${id} name`);
      assert.notEqual(name, "", `operator ${id} nonempty name`);
      assert.notEqual(rewardAddress.toLowerCase(), zeroAddress, `operator ${id} reward address`);
      assert.isTrue(totalExitedValidators >= 0n, `operator ${id} exited validators`);
      assert.isTrue(totalExitedValidators <= totalDepositedValidators, `operator ${id} exited <= deposited`);
      assert.isTrue(totalDepositedValidators <= totalVettedValidators, `operator ${id} deposited <= vetted`);
      assert.isTrue(totalVettedValidators <= totalAddedValidators, `operator ${id} vetted <= added`);
      const [
        targetLimitMode,
        targetValidatorsCount,
        ,
        refundedValidatorsCount,
        ,
        summaryExitedValidators,
        summaryDepositedValidators,
        depositableValidatorsCount,
      ] = await client.read(simpleDvt, "getNodeOperatorSummary", [id]);
      if (exitedNodeOperators.includes(id)) {
        assert.isTrue(targetLimitMode > 0n, `exited operator ${id} target limit mode`);
        assert.equal(depositableValidatorsCount, 0n, `exited operator ${id} depositable validators`);
      }
      assert.equal(targetValidatorsCount, 0n, `operator ${id} target validators`);
      assert.equal(refundedValidatorsCount, 0n, `operator ${id} refunded validators`);
      assert.isTrue(summaryExitedValidators >= 0n, `operator ${id} summary exited validators`);
      assert.isTrue(
        summaryExitedValidators <= summaryDepositedValidators,
        `operator ${id} summary exited <= deposited`,
      );
      assert.isNotNull(depositableValidatorsCount, `operator ${id} summary depositable validators`);
      assert.equal(totalExitedValidators, summaryExitedValidators, `operator ${id} consistent exited validators`);
      assert.equal(
        totalDepositedValidators,
        summaryDepositedValidators,
        `operator ${id} consistent deposited validators`,
      );
      if (targetLimitMode === 0n) {
        assert.equal(
          depositableValidatorsCount,
          totalVettedValidators - totalDepositedValidators,
          `operator ${id} depositability`,
        );
      }
    }
  });

  it("has the expected permission managers and grantees", async function () {
    for (const name of [
      "STAKING_ROUTER_ROLE",
      "MANAGE_NODE_OPERATOR_ROLE",
      "SET_NODE_OPERATOR_LIMIT_ROLE",
      "MANAGE_SIGNING_KEYS",
    ] as const) {
      const manager = name === "MANAGE_SIGNING_KEYS" ? expected.easyTrackExecutor : expected.agent;
      assert.equal(
        (await client.read(governance.acl, "getPermissionManager", [simpleDvt.address, roles[name]])).toLowerCase(),
        manager.toLowerCase(),
        `${name} manager`,
      );
      assert.equal(
        await client.read(simpleDvt, "canPerform", [expected.easyTrackExecutor, roles[name], []]),
        name === "MANAGE_SIGNING_KEYS" ? expected.easyTrackSigningKeysPermission : true,
        `${name} Easy Track executor permission`,
      );
    }
    assert.isTrue(
      await client.read(simpleDvt, "canPerform", [expected.stakingRouter, roles.STAKING_ROUTER_ROLE, []]),
      "staking router permission",
    );
  });

  it("registers all eight Easy Track factories with the expected registry and trusted caller", async function () {
    const factories = (await client.read(contract(EasyTrack_ABI, expected.easyTrack), "getEVMScriptFactories")).map(
      (address) => address.toLowerCase(),
    );
    for (const [name, address] of Object.entries(expected.factories)) {
      assert.include(factories, address.toLowerCase(), `${name} registration`);
      const factory = contract(factoryAbi, address);
      assert.equal(
        (await client.read(factory, "nodeOperatorsRegistry")).toLowerCase(),
        simpleDvt.address.toLowerCase(),
        `${name} registry`,
      );
      assert.equal(
        (await client.read(factory, "trustedCaller")).toLowerCase(),
        expected.trustedCaller.toLowerCase(),
        `${name} trusted caller`,
      );
    }
  });
});
