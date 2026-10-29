import { assert } from "chai";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { isRevertedWith } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { rejects } from "node:assert/strict";
import { encodeErrorResult, zeroHash } from "viem";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { HashConsensus_ABI } from "@/abi/HashConsensus.abi";
import { AccountingOracle_ABI } from "@/abi/AccountingOracle.abi";

const configurations = {
  mainnet: {
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    oracle: "0x852deD011285fe67063a08005c71a85690503Cee",
    implementation: "0xe4f03D1107d1905B6F2A28FCb6Af221E0CE19136",
    consensus: "0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288",
    consensusVersion: 6n,
    genesisTime: 1606824023n,
    epochsPerFrame: 225n,
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
  },
  hoodi: {
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    oracle: "0xcb883B1bD0a41512b42D2dB267F2A2cd919FB216",
    implementation: "0xD00dD90651f031ED3158Cf75AC6e4361B4CCcBD8",
    consensus: "0x32EC59a78abaca3f91527aeB2008925D5AaC1eFC",
    consensusVersion: 6n,
    genesisTime: 1742213400n,
    epochsPerFrame: 225n,
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
  },
} as const;

describe("AccountingOracle acceptance", function () {
  let client: DevRpcClient;
  let oracle: Contract<typeof AccountingOracle_ABI>;
  let consensus: Contract<typeof HashConsensus_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    governance = getGovernanceContracts(network);
    oracle = contract(AccountingOracle_ABI, expected.oracle);
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
    assert.isTrue(
      await client.read(oracle, "hasRole", [await client.read(oracle, "DEFAULT_ADMIN_ROLE"), expected.admin]),
      "DEFAULT_ADMIN_ROLE holder",
    );
  });

  it("has the expected version and consensus connection", async function () {
    assert.equal(await client.read(oracle, "getContractVersion"), 5n, "contract version");
    assert.equal(await client.read(oracle, "getConsensusVersion"), expected.consensusVersion, "consensus version");
    assert.equal(
      (await client.read(oracle, "getConsensusContract")).toLowerCase(),
      expected.consensus.toLowerCase(),
      "consensus contract",
    );
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    const expectedRevert = encodeErrorResult({ abi: AccountingOracle_ABI, errorName: "NonZeroContractVersionOnInit" });
    for (const target of [oracle, contract(AccountingOracle_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [expected.admin, expected.consensus, expected.consensusVersion, 1n], {
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

  it("has the expected locator and extra-data constants", async function () {
    assert.equal(
      (await client.read(oracle, "LOCATOR")).toLowerCase(),
      governance.locator.address.toLowerCase(),
      "locator",
    );
    assert.equal(await client.read(oracle, "EXTRA_DATA_FORMAT_EMPTY"), 0n, "empty format");
    assert.equal(await client.read(oracle, "EXTRA_DATA_FORMAT_LIST"), 1n, "list format");
    assert.equal(await client.read(oracle, "EXTRA_DATA_TYPE_STUCK_VALIDATORS"), 1n, "stuck validators type");
    assert.equal(await client.read(oracle, "EXTRA_DATA_TYPE_EXITED_VALIDATORS"), 2n, "exited validators type");
  });

  it("preserves the report-processing state invariants", async function () {
    const state = await client.read(oracle, "getProcessingState");
    const [refSlot] = await client.read(consensus, "getCurrentFrame");
    const lastProcessingRefSlot = await client.read(oracle, "getLastProcessingRefSlot");
    assert.equal(state.currentFrameRefSlot, refSlot, "frame matches consensus");
    assert.isTrue(lastProcessingRefSlot <= state.currentFrameRefSlot, "processing does not run ahead");
    if (state.mainDataSubmitted) {
      assert.notEqual(state.mainDataHash, zeroHash, "submitted main data hash");
      assert.equal(lastProcessingRefSlot, state.currentFrameRefSlot, "submitted main data frame");
    }
    if (state.extraDataSubmitted) {
      assert.isTrue(state.mainDataSubmitted, "extra data follows main data");
    }
    assert.isTrue(state.extraDataItemsSubmitted <= state.extraDataItemsCount, "submitted extra data count");
    const [, reportRefSlot] = await client.read(oracle, "getConsensusReport");
    assert.isTrue(reportRefSlot <= state.currentFrameRefSlot, "report does not run ahead");
  });

  it("has the expected frame configuration", async function () {
    const [, epochsPerFrame, fastLaneLengthSlots] = await client.read(consensus, "getFrameConfig");
    assert.equal(epochsPerFrame, expected.epochsPerFrame, "epochs per frame");
    assert.equal(fastLaneLengthSlots, expected.fastLaneLengthSlots, "fast lane length");
  });

  it("retains the historical mainnet frame floors", async function () {
    if (client.getNetworkName() !== "mainnet") {
      this.skip();
    }
    const state = await client.read(oracle, "getProcessingState");
    assert.isTrue(state.currentFrameRefSlot > 5254400n, "processing frame floor");
    const [refSlot, deadlineSlot] = await client.read(consensus, "getCurrentFrame");
    assert.isTrue(refSlot > 5254400n, "consensus frame floor");
    assert.isTrue(deadlineSlot > 5254400n, "processing deadline floor");
    const [initialEpoch] = await client.read(consensus, "getFrameConfig");
    assert.isTrue(initialEpoch > 5254400n / 32n, "initial epoch floor");
    assert.isTrue((await client.read(consensus, "getInitialRefSlot")) > 5254400n, "initial ref slot floor");
  });
});
