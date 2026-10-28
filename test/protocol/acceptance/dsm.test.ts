import { assert } from "chai";
import type { Context } from "mocha";
import { encodePacked, keccak256, stringToHex } from "viem";
import { DepositSecurityModule_ABI } from "@/abi/DepositSecurityModule.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";

// Deployment inputs: https://github.com/lidofinance/core/tree/2bd532298d85cdf520169fdc0c5fb0cc9baf03c3
// Configuration follows executed events through mainnet block 26288552 and Hoodi block 3901441.
const configurations = {
  mainnet: {
    depositSecurityModule: "0x39BB5d491e98A44D1bfe8047A737a81E296a63E0",
    deploymentChainId: 1n,
    owner: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    version: 5n,
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    depositContract: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    maxOperatorsPerUnvetting: 200n,
    pauseIntentValidityPeriodBlocks: 6646n,
    guardians: [
      "0x915F0Fa50E1af761B113b41c79ab33Bf4734C36E",
      "0xe387Ba1d5C9f6306eCe9ac949C7fB6233dD5411E",
      "0x35506190Ca6df385aA6Bc4a970646dd4f49426c1",
      "0xDc1579636686C082fc3b00B9EB25259A110D0C44",
      "0x031E597BcF680f1f2293b119b4b2B14096B15497",
      "0x6A22d74a816662078f2371A7138E7614874cd61d",
    ],
    guardianQuorum: 4n,
  },
  hoodi: {
    depositSecurityModule: "0x8E63F0aF403ffd3Cbd5dB18b4ee632314ab49B51",
    deploymentChainId: 560048n,
    owner: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    version: 5n,
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    depositContract: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    maxOperatorsPerUnvetting: 200n,
    pauseIntentValidityPeriodBlocks: 6646n,
    guardians: [
      "0x56a1B0b5074818D568D6608dc07353e81b4b53ec",
      "0x89e1bEBAf6857312bCDc313B93F29aB9cA98000f",
      "0x901789EA029B3c7CEa47019d6Df3C5973212976D",
      "0xa66FDd65Cfc78964A62b5Ec50E5b0Afd0e52D610",
      "0x4EEC6BEd8d5E45f0a6a99F067bC5F6370f2f7221",
      "0x03224cFc446F3166c83E875095e872DD1E098076",
    ],
    guardianQuorum: 2n,
  },
} as const;

// Source assertions: https://github.com/lidofinance/scripts/blob/d02f8786f138583c521d6406fdbf1b2180a131a8/tests/acceptance/test_dsm.py
describe("DepositSecurityModule acceptance", function () {
  let client: DevRpcClient;
  let dsm: Contract<typeof DepositSecurityModule_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    dsm = contract(DepositSecurityModule_ABI, expected.depositSecurityModule);
  });

  it("has the expected owner", async function () {
    assert.equal((await client.read(dsm, "getOwner")).toLowerCase(), expected.owner.toLowerCase(), "owner");
  });

  it("has the expected version", async function () {
    assert.equal(await client.read(dsm, "VERSION"), expected.version, "version");
  });

  it("has deposits unpaused", async function () {
    assert.isFalse(await client.read(dsm, "isDepositsPaused"), "deposits paused");
  });

  it("has the expected linked contracts", async function () {
    assert.equal(
      (await client.read(dsm, "STAKING_ROUTER")).toLowerCase(),
      expected.stakingRouter.toLowerCase(),
      "staking router",
    );
    assert.equal(
      (await client.read(dsm, "DEPOSIT_CONTRACT")).toLowerCase(),
      expected.depositContract.toLowerCase(),
      "deposit contract",
    );
  });

  it("has the expected limits, ordered guardians and membership getters", async function () {
    assert.equal(
      await client.read(dsm, "getMaxOperatorsPerUnvetting"),
      expected.maxOperatorsPerUnvetting,
      "maximum operators per unvetting",
    );
    assert.equal(
      await client.read(dsm, "getPauseIntentValidityPeriodBlocks"),
      expected.pauseIntentValidityPeriodBlocks,
      "pause intent validity period",
    );
    assert.deepEqual(
      (await client.read(dsm, "getGuardians")).map((guardian) => guardian.toLowerCase()),
      expected.guardians.map((guardian) => guardian.toLowerCase()),
      "ordered guardians",
    );
    assert.equal(await client.read(dsm, "getGuardianQuorum"), expected.guardianQuorum, "guardian quorum");
    for (const guardian of expected.guardians) {
      assert.isTrue((await client.read(dsm, "getGuardianIndex", [guardian])) >= 0n, `guardian ${guardian} index`);
      assert.isTrue(await client.read(dsm, "isGuardian", [guardian]), `guardian ${guardian} membership`);
    }
  });

  it("has message prefixes bound to the deployment chain and expected DSM address", async function () {
    // Prefix immutables retain the deployment chain ID when the fork uses another chain ID.
    assert.equal(
      await client.read(dsm, "PAUSE_MESSAGE_PREFIX"),
      keccak256(
        encodePacked(
          ["bytes32", "uint256", "address"],
          [
            keccak256(stringToHex("lido.DepositSecurityModule.PAUSE_MESSAGE")),
            expected.deploymentChainId,
            expected.depositSecurityModule,
          ],
        ),
      ),
      "pause message prefix",
    );
    assert.equal(
      await client.read(dsm, "ATTEST_MESSAGE_PREFIX"),
      keccak256(
        encodePacked(
          ["bytes32", "uint256", "address"],
          [
            keccak256(stringToHex("lido.DepositSecurityModule.ATTEST_MESSAGE")),
            expected.deploymentChainId,
            expected.depositSecurityModule,
          ],
        ),
      ),
      "attest message prefix",
    );
    assert.equal(
      await client.read(dsm, "UNVET_MESSAGE_PREFIX"),
      keccak256(
        encodePacked(
          ["bytes32", "uint256", "address"],
          [
            keccak256(stringToHex("lido.DepositSecurityModule.UNVET_MESSAGE")),
            expected.deploymentChainId,
            expected.depositSecurityModule,
          ],
        ),
      ),
      "unvet message prefix",
    );
  });
});
