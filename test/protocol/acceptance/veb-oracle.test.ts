import { assert } from "chai";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { isRevertedWith } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { rejects } from "node:assert/strict";
import { encodeErrorResult } from "viem";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { ValidatorsExitBusOracle_ABI } from "@/abi/ValidatorsExitBusOracle.abi";

const configurations = {
  mainnet: {
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    oracle: "0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e",
    implementation: "0x2C3386b39db89eef0F362A3BE0C05a6811E809E3",
    consensus: "0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
    consensusVersion: 5n,
    genesisTime: 1606824023n,
    epochsPerFrame: 45n,
    fastLaneLengthSlots: 100n,
    quorum: 5n,
    committee: [
      "0xC4f2704273598d51A0ec76A31C12553ec8f5A891",
      "0xE75A431A98487DC69A14Bdd13d858E3238e9C1b3",
      "0xc77d0Bf3AA4778E36a89CDC8bbc9c34d8060637d",
      "0xc7442d4d8F3FfEa0fA4a18Ad3062c8137cE21749",
      "0x56B3eA8016Da18C6E8CD8135492d242F0dE0DBBC",
      "0x4E3F2DEeb59eB9a205D82D17647b3e56422e0FEe",
      "0xd524101C3c40f71Fce7B9312D299603880a06Bdb",
      "0x99Cd2EF33040879D40BBC77Df81863D97f13C64d",
      "0x5e8Ed9f10307eD6FA793A347e4D0f407D00B9C6f",
    ],
    accountingConsensus: "0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288",
  },
  hoodi: {
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    oracle: "0x8664d394C2B3278F26A1B44B967aEf99707eeAB2",
    implementation: "0xA881F320E17Aa97d6Ce0bE76B0e2620bd2FC555A",
    consensus: "0x30308CD8844fb2DB3ec4D056F1d475a802DCA07c",
    consensusVersion: 5n,
    genesisTime: 1742213400n,
    epochsPerFrame: 45n,
    fastLaneLengthSlots: 100n,
    quorum: 6n,
    committee: [
      "0x929de74c921f3e719Ad2bb026EDeF747d443dC8E",
      "0x9F81976E461B82cfe3CAec06De8eFA8aD5543408",
      "0x9950477b8D8154ef44745612832464C3c2155F79",
      "0xC51fE2B136a24D6eC8368C858Ae5211dc2FE0e0B",
      "0x43c97fEfeF1e41D6429814e2a3Ad37aA096d633e",
      "0xc19a08e427351F51DA7A82136aF66d8F01931738",
      "0x9d7bFAa500b5DeC4FBab2257dfbC0cB3D5c1Fbc8",
      "0x443e31892Ffd51f6f0Fef6DAE4ac2e2795f311Bf",
      "0x89E9FCB24CC82e9A449A69f3932C70ca2FA07E1D",
      "0xAFca4694c06720Ad03037db3760a920320037217",
    ],
    accountingConsensus: "0x32EC59a78abaca3f91527aeB2008925D5AaC1eFC",
  },
} as const;

describe("ValidatorsExitBusOracle acceptance", function () {
  let client: DevRpcClient;
  let oracle: Contract<typeof ValidatorsExitBusOracle_ABI>;
  let consensus: Contract<typeof HashConsensus_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    governance = getGovernanceContracts(network);
    oracle = contract(ValidatorsExitBusOracle_ABI, expected.oracle);
    consensus = contract(HashConsensus_ABI, expected.consensus);
  });

  it("has the expected proxy implementation and admin", async function () {
    const proxy = contract(OssifiableProxy_ABI, oracle.address);
    assert.equal(
      (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.admin.toLowerCase(), "admin");
  });

  it("has the expected version and consensus connection", async function () {
    assert.equal(await client.read(oracle, "getContractVersion"), 3n, "contract version");
    assert.equal(await client.read(oracle, "getConsensusVersion"), expected.consensusVersion, "consensus version");
    assert.equal(
      (await client.read(oracle, "getConsensusContract")).toLowerCase(),
      expected.consensus.toLowerCase(),
      "consensus contract",
    );
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    const admin = await client.read(oracle, "getRoleMember", [await client.read(oracle, "DEFAULT_ADMIN_ROLE"), 0n]);
    const expectedRevert = encodeErrorResult({
      abi: ValidatorsExitBusOracle_ABI,
      errorName: "NonZeroContractVersionOnInit",
    });
    for (const target of [oracle, contract(ValidatorsExitBusOracle_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [admin, expected.accountingConsensus, 1n, 1n, 600n, 11200n, 1n, 48n], {
          from: governance.voting.address,
        }),
        (error: unknown) => isRevertedWith(error, expectedRevert),
        `initialize ${target.address}`,
      );
    }
  });

  it("has the expected chain configuration, quorum and complete committee", async function () {
    const [slotsPerEpoch, secondsPerSlot, genesisTime] = await client.read(consensus, "getChainConfig");
    assert.equal(slotsPerEpoch, 32n, "slots per epoch");
    assert.equal(secondsPerSlot, 12n, "seconds per slot");
    assert.equal(genesisTime, expected.genesisTime, "genesis time");
    assert.equal(await client.read(consensus, "getQuorum"), expected.quorum, "quorum");
    const [members] = await client.read(consensus, "getMembers");
    assert.deepEqual(
      members.map((address) => address.toLowerCase()).sort(),
      expected.committee.map((address) => address.toLowerCase()).sort(),
      "committee",
    );
  });

  it("has the expected immutable chain timing", async function () {
    assert.equal(await client.read(oracle, "SECONDS_PER_SLOT"), 12n, "seconds per slot");
    assert.equal(await client.read(oracle, "GENESIS_TIME"), expected.genesisTime, "genesis time");
  });

  it("has the exit limits installed by finalizeUpgrade_v3", async function () {
    assert.equal(await client.read(oracle, "getMaxValidatorsPerReport"), 600n, "max validators per report");
    const [maxExitBalanceEth, balancePerFrameEth, frameDurationInSec] = await client.read(
      oracle,
      "getExitRequestLimitFullInfo",
    );
    assert.equal(maxExitBalanceEth, 358400n, "max exit balance ETH");
    assert.equal(balancePerFrameEth, 32n, "balance per frame ETH");
    assert.equal(frameDurationInSec, 48n, "frame duration seconds");
  });

  it("has its own frame configuration distinct from AccountingOracle", async function () {
    const [initialEpoch, epochsPerFrame, fastLaneLengthSlots] = await client.read(consensus, "getFrameConfig");
    const accountingConsensus = contract(HashConsensus_ABI, expected.accountingConsensus);
    const [accountingInitialEpoch] = await client.read(accountingConsensus, "getFrameConfig");
    assert.equal(epochsPerFrame, expected.epochsPerFrame, "epochs per frame");
    assert.equal(fastLaneLengthSlots, expected.fastLaneLengthSlots, "fast lane length");
    assert.notEqual(initialEpoch, accountingInitialEpoch, "distinct initial epochs");
    assert.notEqual(
      await client.read(consensus, "getInitialRefSlot"),
      await client.read(accountingConsensus, "getInitialRefSlot"),
      "distinct initial ref slots",
    );
  });

  it("retains the historical mainnet frame floors", async function () {
    if (client.getNetworkName() !== "mainnet") {
      this.skip();
    }
    const [refSlot, deadlineSlot] = await client.read(consensus, "getCurrentFrame");
    assert.isTrue(refSlot >= 6189855n, "consensus frame floor");
    assert.isTrue(deadlineSlot > 6189855n, "processing deadline floor");
  });
});
