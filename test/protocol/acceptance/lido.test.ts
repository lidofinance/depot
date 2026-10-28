import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  keccak256,
  maxUint256,
  parseAbi,
  parseEther,
  stringToHex,
} from "viem";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";
import { AppProxyUpgradeable_ABI } from "@/abi/AppProxyUpgradeable.abi";
import { Lido_ABI } from "@/abi/Lido.abi";
import { StakingRouter_ABI } from "@/abi/StakingRouter.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    implementation: "0x028271E30a695c0527A0C50cA30603feD004cDb0",
    kernel: "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc",
    eip712StETH: "0x8F73e4C2A6D852bb4ab2A45E6a9CF5715b3228B7",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    accountingOracle: "0x852deD011285fe67063a08005c71a85690503Cee",
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    withdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    burner: "0xE76c52750019b80B43E36DF30bf4060EB73F573a",
    nodeOperatorsRegistry: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
    reserveTarget: parseEther("512"),
    maxStakeLimit: parseEther("150000"),
  },
  hoodi: {
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    implementation: "0xB9A2Fb8336f3775d790b3FdD6151e3F193AA7352",
    kernel: "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d",
    eip712StETH: "0x2A1d51BF3aAA7A7D027C8f561e5f579876a17B0a",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    accountingOracle: "0xcb883B1bD0a41512b42D2dB267F2A2cd919FB216",
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    withdrawalQueue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    burner: "0xb2c99cd38a2636a6281a849C8de938B3eF4A7C3D",
    nodeOperatorsRegistry: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
    reserveTarget: 0n,
    maxStakeLimit: parseEther("3000"),
  },
} as const;

const solidityErrorAbi = parseAbi(["error Error(string reason)"]);

describe("Lido acceptance", function () {
  let client: DevRpcClient;
  let lido: Contract<typeof Lido_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let voting: ReturnType<typeof getGovernanceContracts>["voting"];

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    lido = contract(Lido_ABI, expected.lido);
    voting = getGovernanceContracts(network).voting;
  });

  it("has the expected Aragon implementation and initialized app", async function () {
    const proxy = contract(AppProxyUpgradeable_ABI, lido.address);
    assert.equal(
      (await client.read(proxy, "implementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(lido, "kernel")).toLowerCase(), expected.kernel.toLowerCase(), "kernel");
    assert.equal(
      await client.read(lido, "appId"),
      "0x3ca7c3e38968823ccb4c78ea688df41356f182ae1d159e4ee608d30d68cef320",
      "appId",
    );
    assert.isTrue(await client.read(lido, "hasInitialized"), "hasInitialized");
    assert.isFalse(await client.read(lido, "isPetrified"), "isPetrified");
    assert.isFalse(await client.read(lido, "isStopped"), "isStopped");
    assert.equal(await client.read(lido, "getContractVersion"), 4n, "contract version");
  });

  it("has the expected role hashes", async function () {
    for (const role of [
      "PAUSE_ROLE",
      "RESUME_ROLE",
      "STAKING_PAUSE_ROLE",
      "STAKING_CONTROL_ROLE",
      "BUFFER_RESERVE_MANAGER_ROLE",
    ] as const) {
      assert.equal(await client.read(lido, role), keccak256(stringToHex(role)), role);
    }
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    for (const target of [lido, contract(Lido_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [expected.locator, expected.eip712StETH, expected.reserveTarget], {
          from: voting.address,
        }),
        (error: unknown) => {
          const revert =
            error instanceof BaseError &&
            error.walk(
              (cause) =>
                cause instanceof ContractFunctionRevertedError ||
                (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
            );
          if (revert instanceof ContractFunctionRevertedError) return revert.reason === "INIT_ALREADY_INITIALIZED";
          // In-process EDR exposes revert bytes without an RPC error code.
          return (
            revert instanceof Error &&
            "data" in revert &&
            revert.data === encodeErrorResult({ abi: solidityErrorAbi, args: ["INIT_ALREADY_INITIALIZED"] })
          );
        },
        `initialize ${target.address}`,
      );
    }
  });

  it("cannot finalize the proxy upgrade again", async function () {
    const blockNumber = await client.viemClient.getBlockNumber({ cacheTime: 0 });
    const state = await client.viemClient.readContract({
      abi: AccountingOracle_ABI,
      address: expected.accountingOracle,
      functionName: "getProcessingState",
      blockNumber,
    });
    const reason = state.mainDataSubmitted ? "UNEXPECTED_CONTRACT_VERSION" : "NO_REPORT";
    await rejects(
      client.viemClient.simulateContract({
        ...lido,
        functionName: "finalizeUpgrade_v4",
        args: [expected.reserveTarget],
        account: voting.address,
        blockNumber,
      }),
      (error: unknown) => {
        const revert =
          error instanceof BaseError &&
          error.walk(
            (cause) =>
              cause instanceof ContractFunctionRevertedError ||
              (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
          );
        if (revert instanceof ContractFunctionRevertedError) return revert.reason === reason;
        return (
          revert instanceof Error &&
          "data" in revert &&
          revert.data === encodeErrorResult({ abi: solidityErrorAbi, args: [reason] })
        );
      },
      "finalizeUpgrade_v4 proxy",
    );
  });

  it("cannot finalize the petrified implementation", async function () {
    await rejects(
      client.simulate(contract(Lido_ABI, expected.implementation), "finalizeUpgrade_v4", [expected.reserveTarget], {
        from: voting.address,
      }),
      (error: unknown) => {
        const revert =
          error instanceof BaseError &&
          error.walk(
            (cause) =>
              cause instanceof ContractFunctionRevertedError ||
              (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
          );
        if (revert instanceof ContractFunctionRevertedError) return revert.reason === "NOT_INITIALIZED";
        return (
          revert instanceof Error &&
          "data" in revert &&
          revert.data === encodeErrorResult({ abi: solidityErrorAbi, args: ["NOT_INITIALIZED"] })
        );
      },
      "finalizeUpgrade_v4 implementation",
    );
  });

  it("has the expected reserve target and linked contracts", async function () {
    assert.equal(
      await client.read(lido, "getDepositsReserveTarget"),
      expected.reserveTarget,
      "deposits reserve target",
    );
    assert.equal(
      (await client.read(lido, "getEIP712StETH")).toLowerCase(),
      expected.eip712StETH.toLowerCase(),
      "EIP712StETH",
    );
    assert.equal((await client.read(lido, "getLidoLocator")).toLowerCase(), expected.locator.toLowerCase(), "Locator");
  });

  it("preserves the initial holder and Burner allowances", async function () {
    const deadHolder = "0x000000000000000000000000000000000000dead";
    const deadShares = await client.read(lido, "sharesOf", [deadHolder]);
    assert.isTrue((await client.read(lido, "balanceOf", [deadHolder])) > 0n, "initial holder balance");
    assert.isTrue(deadShares > 0n, "initial holder shares");
    assert.isTrue((await client.read(lido, "getTotalShares")) > deadShares, "shares outside the initial holder");
    assert.equal(
      await client.read(lido, "allowance", [expected.withdrawalQueue, expected.burner]),
      maxUint256,
      "WithdrawalQueue to Burner allowance",
    );
    assert.equal(
      await client.read(lido, "allowance", [expected.nodeOperatorsRegistry, expected.burner]),
      0n,
      "NodeOperatorsRegistry to Burner allowance",
    );
  });

  it("has active staking with the expected limit and a positive buffer", async function () {
    const [isStakingPaused, isStakingLimitSet, , maxStakeLimit] = await client.read(lido, "getStakeLimitFullInfo");
    assert.isFalse(isStakingPaused, "staking paused");
    assert.isTrue(isStakingLimitSet, "staking limit set");
    assert.equal(maxStakeLimit, expected.maxStakeLimit, "max stake limit");
    assert.isTrue((await client.read(lido, "getBufferedEther")) > 0n, "buffered ether");
  });

  it("keeps beacon and staking module counters consistent", async function () {
    const stakingRouter = contract(StakingRouter_ABI, expected.stakingRouter);
    const modules = await client.read(stakingRouter, "getStakingModules");
    let totalExitedValidators = 0n;
    let totalDepositedValidators = 0n;
    for (const module of modules) {
      const summary = await client.read(stakingRouter, "getStakingModuleSummary", [BigInt(module.id)]);
      totalExitedValidators += summary.totalExitedValidators;
      totalDepositedValidators += summary.totalDepositedValidators;
    }
    const [depositedValidators, beaconValidators] = await client.read(lido, "getBeaconStat");
    assert.equal(depositedValidators, beaconValidators, "beacon and deposited validators");
    assert.equal(depositedValidators, totalDepositedValidators, "module deposited validators");
    assert.isTrue(totalExitedValidators <= depositedValidators, "exited validators cannot exceed deposited validators");
  });

  it("retains the historical mainnet deposited validators and rewards floors", async function () {
    if (client.getNetworkName() !== "mainnet") this.skip();
    const [depositedValidators] = await client.read(lido, "getBeaconStat");
    assert.isTrue(depositedValidators >= 176018n, "historical deposited validators");
    assert.isTrue(
      (await client.read(lido, "getTotalELRewardsCollected")) >= 50327973200740183385860n,
      "historical EL rewards collected",
    );
  });

  it("keeps beacon balance statistics consistent", async function () {
    const [activeBalance, pendingBalance, depositedSinceLastReport, depositedForCurrentReport] = await client.read(
      lido,
      "getBalanceStats",
    );
    const [, , beaconBalance] = await client.read(lido, "getBeaconStat");
    assert.isTrue(activeBalance > 0n, "active validators balance");
    assert.equal(beaconBalance, activeBalance + pendingBalance, "active and pending beacon balance");
    assert.isTrue(depositedForCurrentReport <= depositedSinceLastReport, "deposits attributable to the current report");
  });
});
