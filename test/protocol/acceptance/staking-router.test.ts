import { assert } from "chai";
import { rejects } from "node:assert/strict";
import { encodeErrorResult } from "viem";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { isRevertedWith } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    implementation: "0xDD76927045435C7605cf6f5F978cfb8CABDb5F80",
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    depositContract: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    withdrawalVault: "0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f",
    withdrawalCredentials: "0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f",
    version: 4n,
    maxTopUpPerBlockGwei: 3200000000000n,
    communityStakingModuleId: 3n,
    curatedV2ModuleId: 4n,
    modules: [
      {
        id: 1,
        stakingModuleAddress: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
        name: "curated-onchain-v1",
        stakingModuleFee: 350,
        treasuryFee: 650,
        stakeShareLimit: 0,
        status: 0,
        priorityExitShareThreshold: 0,
        maxDepositsPerBlock: 150n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 2,
        stakingModuleAddress: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433",
        name: "SimpleDVT",
        stakingModuleFee: 800,
        treasuryFee: 200,
        stakeShareLimit: 430,
        status: 0,
        priorityExitShareThreshold: 478,
        maxDepositsPerBlock: 150n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 3,
        stakingModuleAddress: "0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F",
        name: "Community Staking",
        stakingModuleFee: 600,
        treasuryFee: 400,
        stakeShareLimit: 900,
        status: 0,
        priorityExitShareThreshold: 1080,
        maxDepositsPerBlock: 30n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 4,
        stakingModuleAddress: "0xDa5F930cE326EB5205085D66c72A4E79d60cB8C1",
        name: "curated-onchain-v2",
        stakingModuleFee: 400,
        treasuryFee: 600,
        stakeShareLimit: 10000,
        status: 0,
        priorityExitShareThreshold: 10000,
        maxDepositsPerBlock: 100n,
        minDepositBlockDistance: 75n,
      },
      {
        id: 5,
        stakingModuleAddress: "0x792Cd25e4aE3578375031FB55e048E163A804F7B",
        name: "Community Staking 0x02",
        stakingModuleFee: 200,
        treasuryFee: 800,
        stakeShareLimit: 1,
        status: 0,
        priorityExitShareThreshold: 240,
        maxDepositsPerBlock: 30n,
        minDepositBlockDistance: 25n,
      },
    ],
  },
  hoodi: {
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    implementation: "0x05C392877165372Bf76dd08d52D4445bFEd6FF1F",
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    depositContract: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    withdrawalVault: "0x4473dcddbf77679a643bdb654dbd86d67f8d32f2",
    withdrawalCredentials: "0x0100000000000000000000004473dcddbf77679a643bdb654dbd86d67f8d32f2",
    version: 4n,
    maxTopUpPerBlockGwei: 3200000000000n,
    communityStakingModuleId: 4n,
    curatedV2ModuleId: 5n,
    modules: [
      {
        id: 1,
        stakingModuleAddress: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
        name: "curated-onchain-v1",
        stakingModuleFee: 500,
        treasuryFee: 500,
        stakeShareLimit: 0,
        status: 0,
        priorityExitShareThreshold: 0,
        maxDepositsPerBlock: 150n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 2,
        stakingModuleAddress: "0x0B5236BECA68004DB89434462DfC3BB074d2c830",
        name: "SimpleDVT",
        stakingModuleFee: 800,
        treasuryFee: 200,
        stakeShareLimit: 400,
        status: 0,
        priorityExitShareThreshold: 10000,
        maxDepositsPerBlock: 150n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 3,
        stakingModuleAddress: "0x682E94d2630846a503BDeE8b6810DF71C9806891",
        name: "Sandbox",
        stakingModuleFee: 500,
        treasuryFee: 500,
        stakeShareLimit: 100,
        status: 0,
        priorityExitShareThreshold: 200,
        maxDepositsPerBlock: 100n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 4,
        stakingModuleAddress: "0x79CEf36D84743222f37765204Bec41E92a93E59d",
        name: "Community Staking",
        stakingModuleFee: 600,
        treasuryFee: 400,
        stakeShareLimit: 1600,
        status: 0,
        priorityExitShareThreshold: 2100,
        maxDepositsPerBlock: 30n,
        minDepositBlockDistance: 25n,
      },
      {
        id: 5,
        stakingModuleAddress: "0x87EB69Ae51317405FD285efD2326a4a11f6173b9",
        name: "curated-onchain-v2",
        stakingModuleFee: 400,
        treasuryFee: 600,
        stakeShareLimit: 10000,
        status: 0,
        priorityExitShareThreshold: 10000,
        maxDepositsPerBlock: 100n,
        minDepositBlockDistance: 75n,
      },
      {
        id: 6,
        stakingModuleAddress: "0xbb7dd81FAC80f3Effa10eA8b973c15AE65a4CAf9",
        name: "Community Staking 0x02",
        stakingModuleFee: 200,
        treasuryFee: 800,
        stakeShareLimit: 800,
        status: 0,
        priorityExitShareThreshold: 1000,
        maxDepositsPerBlock: 30n,
        minDepositBlockDistance: 25n,
      },
    ],
  },
} as const;

const invalidInitialization = encodeErrorResult({ abi: StakingRouter_ABI, errorName: "InvalidInitialization" });

describe("StakingRouter acceptance", function () {
  let client: DevRpcClient;
  let stakingRouter: Contract<typeof StakingRouter_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let voting: ReturnType<typeof getGovernanceContracts>["voting"];

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    stakingRouter = contract(StakingRouter_ABI, expected.stakingRouter);
    voting = getGovernanceContracts(network).voting;
  });

  it("has the expected proxy implementation and admin", async function () {
    const proxy = contract(OssifiableProxy_ABI, stakingRouter.address);
    assert.equal(
      (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.admin.toLowerCase(), "admin");
  });

  it("has the expected linked contracts, version and global top-up cap", async function () {
    for (const [getter, address] of [
      ["DEPOSIT_CONTRACT", expected.depositContract],
      ["LIDO", expected.lido],
      ["LIDO_LOCATOR", expected.locator],
    ] as const) {
      assert.equal((await client.read(stakingRouter, getter)).toLowerCase(), address.toLowerCase(), getter);
    }
    assert.equal(await client.read(stakingRouter, "getContractVersion"), expected.version, "contract version");
    assert.equal(
      await client.read(stakingRouter, "getMaxTopUpPerBlockGwei"),
      expected.maxTopUpPerBlockGwei,
      "global top-up cap",
    );
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    for (const target of [stakingRouter, contract(StakingRouter_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [expected.admin, expected.withdrawalCredentials, 0n], {
          from: voting.address,
        }),
        (error: unknown) => isRevertedWith(error, invalidInitialization),
        `initialize ${target.address}`,
      );
    }
  });

  it("cannot finalize the proxy upgrade again", async function () {
    await rejects(
      client.simulate(stakingRouter, "finalizeUpgrade_v4", [0n], { from: voting.address }),
      (error: unknown) => isRevertedWith(error, invalidInitialization),
      "finalizeUpgrade_v4 proxy",
    );
  });

  it("has the expected protocol constants", async function () {
    assert.equal(await client.read(stakingRouter, "FEE_PRECISION_POINTS"), 100n * 10n ** 18n, "fee precision");
    assert.equal(await client.read(stakingRouter, "MAX_STAKING_MODULES_COUNT"), 32n, "maximum module count");
    assert.equal(await client.read(stakingRouter, "MAX_STAKING_MODULE_NAME_LENGTH"), 31n, "maximum module name length");
    assert.equal(await client.read(stakingRouter, "TOTAL_BASIS_POINTS"), 10000n, "total basis points");
  });

  it("has the complete ordered staking module list and active status getters", async function () {
    assert.equal(
      await client.read(stakingRouter, "getStakingModulesCount"),
      BigInt(expected.modules.length),
      "module count",
    );
    assert.deepEqual(
      await client.read(stakingRouter, "getStakingModuleIds"),
      expected.modules.map(({ id }) => BigInt(id)),
      "module IDs",
    );
    for (const module of expected.modules) {
      const id = BigInt(module.id);
      assert.isTrue(await client.read(stakingRouter, "getStakingModuleIsActive", [id]), `module ${id} active`);
      assert.isFalse(await client.read(stakingRouter, "getStakingModuleIsStopped", [id]), `module ${id} stopped`);
      assert.isFalse(
        await client.read(stakingRouter, "getStakingModuleIsDepositsPaused", [id]),
        `module ${id} deposits paused`,
      );
      assert.equal(
        await client.read(stakingRouter, "getStakingModuleStatus", [id]),
        module.status,
        `module ${id} status`,
      );
    }
  });

  it("has the expected configuration in every staking module compatibility struct", async function () {
    for (const module of expected.modules) {
      const actual = await client.read(stakingRouter, "getStakingModule", [BigInt(module.id)]);
      assert.equal(actual.id, module.id, `module ${module.id} ID`);
      assert.equal(
        actual.stakingModuleAddress.toLowerCase(),
        module.stakingModuleAddress.toLowerCase(),
        `module ${module.id} address`,
      );
      for (const field of [
        "stakingModuleFee",
        "treasuryFee",
        "stakeShareLimit",
        "status",
        "name",
        "priorityExitShareThreshold",
        "maxDepositsPerBlock",
        "minDepositBlockDistance",
      ] as const) {
        assert.equal(actual[field], module[field], `module ${module.id} ${field}`);
      }
    }
  });

  it("retains the historical mainnet Curated module counters and deposit metadata", async function () {
    if (client.getNetworkName() !== "mainnet") {
      this.skip();
    }
    assert.isTrue((await client.read(stakingRouter, "getStakingModuleNonce", [1n])) >= 7260n, "Curated nonce");
    const curated = await client.read(stakingRouter, "getStakingModule", [1n]);
    assert.isTrue(curated.lastDepositAt >= 1679672628n, "Curated last deposit timestamp");
    assert.isTrue(curated.lastDepositBlock >= 8705383n, "Curated last deposit block");
    assert.isTrue(curated.exitedValidatorsCount >= 145n, "Curated exited validators");
  });

  it("has nonnegative nonces and positive deposit metadata for the migrated modules", async function () {
    for (const id of [2n, expected.communityStakingModuleId, expected.curatedV2ModuleId]) {
      assert.isTrue((await client.read(stakingRouter, "getStakingModuleNonce", [id])) >= 0n, `module ${id} nonce`);
      const module = await client.read(stakingRouter, "getStakingModule", [id]);
      assert.isTrue(module.lastDepositAt > 0n, `module ${id} last deposit timestamp`);
      assert.isTrue(module.lastDepositBlock > 0n, `module ${id} last deposit block`);
    }
    for (const id of [2n, expected.communityStakingModuleId]) {
      const module = await client.read(stakingRouter, "getStakingModule", [id]);
      assert.isTrue(module.exitedValidatorsCount >= 0n, `module ${id} exited validators`);
    }
  });

  it("has the expected aggregate fee precision and total fee ceiling", async function () {
    const [, , basePrecision] = await client.read(stakingRouter, "getStakingFeeAggregateDistribution");
    assert.equal(basePrecision, 100n * 10n ** 18n, "aggregate fee base precision");
    assert.isTrue((await client.read(stakingRouter, "getTotalFeeE4Precision")) <= 1000, "total fee ceiling");
  });

  it("has withdrawal credentials for the expected vault and type", async function () {
    const credentials = await client.read(stakingRouter, "getWithdrawalCredentials");
    assert.isTrue(credentials.startsWith("0x01"), "withdrawal credentials type");
    assert.isTrue(
      credentials.endsWith(expected.withdrawalVault.slice(2).toLowerCase()),
      "withdrawal credentials vault",
    );
    assert.equal(credentials, expected.withdrawalCredentials, "withdrawal credentials");
  });
});
