import { assert } from "chai";
import type { Context } from "mocha";
import { parseAbi, zeroAddress } from "viem";
import { DualGovernance_ABI } from "@/abi/DualGovernance.abi";
import { DualGovernanceConfigProvider_ABI } from "@/abi/DualGovernanceConfigProvider.abi";
import { EmergencyProtectedTimelock_ABI } from "@/abi/EmergencyProtectedTimelock.abi";
import { Escrow_ABI } from "@/abi/Escrow.abi";
import { Executor_ABI } from "@/abi/Executor.abi";
import { TimelockedGovernance_ABI } from "@/abi/TimelockedGovernance.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";

const configurations = {
  mainnet: {
    dualGovernance: "0xC1db28B3301331277e307FDCfF8DE28242A4486E",
    configProvider: "0xa1692Af6FDfdD1030E4E9c4Bc429986FA64CB5EF",
    timelock: "0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316",
    voting: "0x2e59A20f205bB85a89C53f1936454680651E618e",
    executors: ["0x23E0B465633FF5178808F4A75186E2F2F9537021"],
    resealManager: "0x7914b5a1539b97Bd0bbd155757F25FD79A522d24",
    resealCommittee: "0xFFe21561251c49AdccFad065C94Fb4931dF49081",
    emergencyGovernance: "0x553337946F2FAb8911774b20025fa776B76a7CcE",
    maxTiebreakerActivationTimeout: 63072000,
    minTiebreakerActivationTimeout: 15768000,
    maxSealableWithdrawalBlockersCount: 255,
    tiebreakerActivationTimeout: 31536000,
    withdrawalBlockers: [
      "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
      "0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e",
      "0xDC00116a0D3E064427dA2600449cfD2566B3037B",
    ],
    proposersCount: 1,
    escrowMasterCopy: "0xd6A67636c05BeB5B4a5c90D408b03A63c4e39426",
    vetoSignallingEscrow: "0x165813A31446a98c84E20Dda8C101BB3C8228e1c",
    maxMinAssetsLockDuration: 4147200,
    st_eth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    withdrawal_queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    wst_eth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    config: {
      FIRST_SEAL_RAGE_QUIT_SUPPORT: 10000000000000000,
      SECOND_SEAL_RAGE_QUIT_SUPPORT: 100000000000000000,
      MIN_ASSETS_LOCK_DURATION: 18000,
      RAGE_QUIT_ETH_WITHDRAWALS_DELAY_GROWTH: 1296000,
      RAGE_QUIT_ETH_WITHDRAWALS_MIN_DELAY: 5184000,
      RAGE_QUIT_ETH_WITHDRAWALS_MAX_DELAY: 15552000,
      RAGE_QUIT_EXTENSION_PERIOD_DURATION: 604800,
      VETO_COOLDOWN_DURATION: 18000,
      VETO_SIGNALLING_DEACTIVATION_MAX_DURATION: 259200,
      VETO_SIGNALLING_MIN_ACTIVE_DURATION: 18000,
      VETO_SIGNALLING_MAX_DURATION: 3888000,
      VETO_SIGNALLING_MIN_DURATION: 432000,
    },
    timelockValues: {
      MAX_AFTER_SCHEDULE_DELAY: 864000,
      MAX_AFTER_SUBMIT_DELAY: 2592000,
      MAX_EMERGENCY_MODE_DURATION: 31536000,
      MAX_EMERGENCY_PROTECTION_DURATION: 94608000,
      MIN_EXECUTION_DELAY: 259200,
      AFTER_SCHEDULE_DELAY: 86400,
      AFTER_SUBMIT_DELAY: 259200,
    },
    emergencyActivationCommittee: "0x8B7854488Fde088d686Ea672B6ba1A5242515f45",
    emergencyExecutionCommittee: "0xC7792b3F2B399bB0EdF53fECDceCeB97FBEB18AF",
    emergencyProtectionDetails: [2592000, 0, 1813449600],
    coreCommittee: {
      ADDRESS: "0xf65614d73952Be91ce0aE7Dd9cFf25Ba15bEE2f5",
      OWNER: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
      TIMELOCK_DURATION: 2592000,
      QUORUM: 2,
      MEMBERS: [
        "0x3D3ba54D54bbFF40F2Dfa2A8e27bD4dE3dab2951",
        "0xDBfa0B8A15a503f25224fcA5F84a3853230A715C",
        "0xBF048f2111497B6Df5E062811f5fC422804D4baE",
      ],
    },
    subCommittees: [
      {
        ADDRESS: "0x3D3ba54D54bbFF40F2Dfa2A8e27bD4dE3dab2951",
        OWNER: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
        QUORUM: 3,
        MEMBERS: [
          "0x805fa0f79DC0DDCD73dCBc23487d2D5bd77de598",
          "0x49769C3443c74f144991cA560ba5F635581B8176",
          "0x9A921867EbB579D137184b397E7D087f1ae716fd",
          "0x81000e270B4f66B8666544E8FEc073e0a23FFf00",
          "0xD8a9072D82a28307279aC0aD3c97Cb61bEe67952",
        ],
      },
      {
        ADDRESS: "0xDBfa0B8A15a503f25224fcA5F84a3853230A715C",
        OWNER: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
        QUORUM: 5,
        MEMBERS: [
          "0x9837b0Db0b733DED04D96a0A25Ba1E414A6C4c08",
          "0xDBD124e898839ec8C829d806C0328f069d1bB810",
          "0xf8Bfa395744Cb25fa4368Ffe2344Dc35546092d9",
          "0x8103E9eDC04d87F6DA24A3a0c7778daE689E9D63",
          "0xFCD02C040ceA45DC6CEC3E24F1D3946FCE7077b0",
          "0xD7cABE01709c7E36e9D1fb3248A19b525578a1Fc",
          "0x8ed4dfd3A610CCF1FB45e797bf5D8e0f93084F22",
        ],
      },
      {
        ADDRESS: "0xBF048f2111497B6Df5E062811f5fC422804D4baE",
        OWNER: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
        QUORUM: 3,
        MEMBERS: [
          "0x80B2D9FA613c35Ec52B0dA5D84e6A819bcc5e369",
          "0xEC7ABf73f339361ecCA951E1746C90a3e6205BFC",
          "0xb04b6fB471E766D7F21A6AA0E4E25B2AEA0a75AB",
          "0x60BDa95a40d5536303BFcf84D679ca461A23398d",
          "0x5d60F5d653Cc318d1f0ABacd83eD4feeAa6e5804",
        ],
      },
    ],
  },
  hoodi: {
    dualGovernance: "0x9CAaCCc62c66d817CC59c44780D1b722359795bF",
    configProvider: "0x2b685e6fB288bBb7A82533BAfb679FfDF6E5bb33",
    timelock: "0x0A5E22782C0Bd4AddF10D771f0bF0406B038282d",
    voting: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
    executors: ["0x0eCc17597D292271836691358B22340b78F3035B"],
    resealManager: "0x05172CbCDb7307228F781436b327679e4DAE166B",
    resealCommittee: "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102",
    emergencyGovernance: "0x69E8e916c4A19F42C13C802abDF2767E1fB4F059",
    maxTiebreakerActivationTimeout: 1800,
    minTiebreakerActivationTimeout: 300,
    maxSealableWithdrawalBlockersCount: 255,
    tiebreakerActivationTimeout: 900,
    withdrawalBlockers: [
      "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
      "0x8664d394C2B3278F26A1B44B967aEf99707eeAB2",
      "0x6679090D92b08a2a686eF8614feECD8cDFE209db",
    ],
    proposersCount: 1,
    escrowMasterCopy: "0x61b7C2351F63b7f9840736D020eE65D2803A00fb",
    vetoSignallingEscrow: "0x781afe6C8D768CEaA9a97f2A75714e80AE0e83B9",
    maxMinAssetsLockDuration: 3600,
    st_eth: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    withdrawal_queue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    wst_eth: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
    config: {
      FIRST_SEAL_RAGE_QUIT_SUPPORT: 30000000000000000,
      SECOND_SEAL_RAGE_QUIT_SUPPORT: 150000000000000000,
      MIN_ASSETS_LOCK_DURATION: 300,
      RAGE_QUIT_ETH_WITHDRAWALS_DELAY_GROWTH: 1200,
      RAGE_QUIT_ETH_WITHDRAWALS_MIN_DELAY: 600,
      RAGE_QUIT_ETH_WITHDRAWALS_MAX_DELAY: 3600,
      RAGE_QUIT_EXTENSION_PERIOD_DURATION: 180,
      VETO_COOLDOWN_DURATION: 180,
      VETO_SIGNALLING_DEACTIVATION_MAX_DURATION: 300,
      VETO_SIGNALLING_MIN_ACTIVE_DURATION: 180,
      VETO_SIGNALLING_MAX_DURATION: 1800,
      VETO_SIGNALLING_MIN_DURATION: 300,
    },
    timelockValues: {
      MAX_AFTER_SCHEDULE_DELAY: 1800,
      MAX_AFTER_SUBMIT_DELAY: 1800,
      MAX_EMERGENCY_MODE_DURATION: 2592000,
      MAX_EMERGENCY_PROTECTION_DURATION: 63072000,
      MIN_EXECUTION_DELAY: 120,
      AFTER_SCHEDULE_DELAY: 120,
      AFTER_SUBMIT_DELAY: 120,
    },
    emergencyActivationCommittee: "0xA678c29cbFde2C74aF15C7724EE4b1527A50D45B",
    emergencyExecutionCommittee: "0x8E1Ce8995E370222CbD825fFD7Dce2A5BfE1E631",
    emergencyProtectionDetails: [86400, 0, 1777975200],
    coreCommittee: {
      ADDRESS: "0x9Ce4bA766C87cC87e507307163eA54C5003A3563",
      OWNER: "0x0eCc17597D292271836691358B22340b78F3035B",
      QUORUM: 2,
      TIMELOCK_DURATION: 900,
      MEMBERS: [
        "0xEd27F0d08630685A0cEFb1040596Cb264cf79f14",
        "0xE3e3c67997A4Db7d47ac7fa8ef81B677daBe5794",
        "0xF4F16CB3B9E7a076E55c508035f25E606913Cc9d",
      ],
    },
    subCommittees: [
      {
        ADDRESS: "0xEd27F0d08630685A0cEFb1040596Cb264cf79f14",
        QUORUM: 2,
        OWNER: "0x0eCc17597D292271836691358B22340b78F3035B",
        MEMBERS: [
          "0x36c648351274bb4455ba6aAabF3F976824a93aF4",
          "0x6FD09F5b4341C79CBDf679bccC2394C6FD7D0016",
          "0xe8B2097674daF8fC3DcCDDf05a2cBeF8253A4bAB",
          "0x7Cd64b87251f793027590c34b206145c3aa362Ae",
          "0x526d46eCa1d7969924e981ecDbcAa74e9f0EE566",
          "0x6389CBcF38172a1e8eCF1C34c00cd7f603AfB80C",
        ],
      },
      {
        ADDRESS: "0xE3e3c67997A4Db7d47ac7fa8ef81B677daBe5794",
        QUORUM: 2,
        OWNER: "0x0eCc17597D292271836691358B22340b78F3035B",
        MEMBERS: [
          "0x36c648351274bb4455ba6aAabF3F976824a93aF4",
          "0x6FD09F5b4341C79CBDf679bccC2394C6FD7D0016",
          "0xe8B2097674daF8fC3DcCDDf05a2cBeF8253A4bAB",
          "0x7Cd64b87251f793027590c34b206145c3aa362Ae",
          "0x526d46eCa1d7969924e981ecDbcAa74e9f0EE566",
          "0x6389CBcF38172a1e8eCF1C34c00cd7f603AfB80C",
        ],
      },
      {
        ADDRESS: "0xF4F16CB3B9E7a076E55c508035f25E606913Cc9d",
        QUORUM: 2,
        OWNER: "0x0eCc17597D292271836691358B22340b78F3035B",
        MEMBERS: [
          "0x36c648351274bb4455ba6aAabF3F976824a93aF4",
          "0x6FD09F5b4341C79CBDf679bccC2394C6FD7D0016",
          "0xe8B2097674daF8fC3DcCDDf05a2cBeF8253A4bAB",
          "0x7Cd64b87251f793027590c34b206145c3aa362Ae",
          "0x526d46eCa1d7969924e981ecDbcAa74e9f0EE566",
          "0x6389CBcF38172a1e8eCF1C34c00cd7f603AfB80C",
        ],
      },
    ],
  },
} as const;

const committeeAbi = parseAbi([
  "function owner() view returns (address)",
  "function getMembers() view returns (address[])",
  "function getQuorum() view returns (uint256)",
  "function getTimelockDuration() view returns (uint32)",
  "function DUAL_GOVERNANCE() view returns (address)",
  "function TIEBREAKER_CORE_COMMITTEE() view returns (address)",
]);
const resealManagerAbi = parseAbi(["function EMERGENCY_PROTECTED_TIMELOCK() view returns (address)"]);

describe("DualGovernance acceptance", function () {
  let client: DevRpcClient;
  let expected: (typeof configurations)[keyof typeof configurations];
  let dualGovernance: Contract<typeof DualGovernance_ABI>;

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    dualGovernance = contract(DualGovernance_ABI, expected.dualGovernance);
  });

  it("has the expected governance configuration, proposer and signalling escrow", async function () {
    for (const [getter, address] of [
      ["getConfigProvider", expected.configProvider],
      ["TIMELOCK", expected.timelock],
      ["getResealManager", expected.resealManager],
      ["getResealCommittee", expected.resealCommittee],
    ] as const) {
      assert.equal((await client.read(dualGovernance, getter)).toLowerCase(), address.toLowerCase(), getter);
    }
    const proposer = await client.read(dualGovernance, "getProposer", [expected.voting]);
    assert.equal(proposer.account.toLowerCase(), expected.voting.toLowerCase(), "proposer account");
    assert.equal(proposer.executor.toLowerCase(), expected.executors[0].toLowerCase(), "proposer executor");
    for (const [getter, value] of [
      ["MAX_TIEBREAKER_ACTIVATION_TIMEOUT", expected.maxTiebreakerActivationTimeout],
      ["MIN_TIEBREAKER_ACTIVATION_TIMEOUT", expected.minTiebreakerActivationTimeout],
      ["MAX_SEALABLE_WITHDRAWAL_BLOCKERS_COUNT", expected.maxSealableWithdrawalBlockersCount],
    ] as const) {
      assert.equal(BigInt(await client.read(dualGovernance, getter)), BigInt(value), getter);
    }
    assert.equal(
      (await client.read(dualGovernance, "getProposalsCanceller")).toLowerCase(),
      expected.voting.toLowerCase(),
    );
    const details = await client.read(dualGovernance, "getTiebreakerDetails");
    assert.isFalse(details.isTie, "is tie");
    assert.equal(details.tiebreakerCommittee.toLowerCase(), expected.coreCommittee.ADDRESS.toLowerCase());
    assert.equal(details.tiebreakerActivationTimeout, expected.tiebreakerActivationTimeout);
    assert.deepEqual(
      details.sealableWithdrawalBlockers.map((address) => address.toLowerCase()),
      expected.withdrawalBlockers.map((address) => address.toLowerCase()),
    );
    assert.lengthOf(await client.read(dualGovernance, "getProposers"), expected.proposersCount);
    assert.equal(
      (await client.read(dualGovernance, "getVetoSignallingEscrow")).toLowerCase(),
      expected.vetoSignallingEscrow.toLowerCase(),
    );
  });

  it("has the expected emergency timelock limits, authorities and protection details", async function () {
    const timelock = contract(EmergencyProtectedTimelock_ABI, expected.timelock);
    for (const [getter, key] of [
      ["MAX_AFTER_SCHEDULE_DELAY", "MAX_AFTER_SCHEDULE_DELAY"],
      ["MAX_AFTER_SUBMIT_DELAY", "MAX_AFTER_SUBMIT_DELAY"],
      ["MAX_EMERGENCY_MODE_DURATION", "MAX_EMERGENCY_MODE_DURATION"],
      ["MAX_EMERGENCY_PROTECTION_DURATION", "MAX_EMERGENCY_PROTECTION_DURATION"],
      ["MIN_EXECUTION_DELAY", "MIN_EXECUTION_DELAY"],
      ["getAfterScheduleDelay", "AFTER_SCHEDULE_DELAY"],
      ["getAfterSubmitDelay", "AFTER_SUBMIT_DELAY"],
    ] as const) {
      assert.equal(BigInt(await client.read(timelock, getter)), BigInt(expected.timelockValues[key]), getter);
    }
    assert.equal((await client.read(timelock, "getAdminExecutor")).toLowerCase(), expected.executors[0].toLowerCase());
    assert.equal((await client.read(timelock, "getGovernance")).toLowerCase(), expected.dualGovernance.toLowerCase());
    assert.isFalse(await client.read(timelock, "isEmergencyModeActive"));
    assert.isTrue(await client.read(timelock, "isEmergencyProtectionEnabled"));
    assert.equal(
      (await client.read(timelock, "getEmergencyActivationCommittee")).toLowerCase(),
      expected.emergencyActivationCommittee.toLowerCase(),
    );
    assert.equal(
      (await client.read(timelock, "getEmergencyExecutionCommittee")).toLowerCase(),
      expected.emergencyExecutionCommittee.toLowerCase(),
    );
    assert.equal(
      (await client.read(timelock, "getEmergencyGovernance")).toLowerCase(),
      expected.emergencyGovernance.toLowerCase(),
    );
    const details = await client.read(timelock, "getEmergencyProtectionDetails");
    assert.equal(details.emergencyModeDuration, expected.emergencyProtectionDetails[0]);
    assert.equal(Number(details.emergencyModeEndsAfter), expected.emergencyProtectionDetails[1]);
    assert.equal(Number(details.emergencyProtectionEndsAfter), expected.emergencyProtectionDetails[2]);
  });

  it("has the expected emergency governance links", async function () {
    const emergencyGovernance = contract(TimelockedGovernance_ABI, expected.emergencyGovernance);
    assert.equal((await client.read(emergencyGovernance, "GOVERNANCE")).toLowerCase(), expected.voting.toLowerCase());
    assert.equal((await client.read(emergencyGovernance, "TIMELOCK")).toLowerCase(), expected.timelock.toLowerCase());
  });

  it("has timelock-owned executors", async function () {
    for (const address of expected.executors) {
      assert.equal(
        (await client.read(contract(Executor_ABI, address), "owner")).toLowerCase(),
        expected.timelock.toLowerCase(),
      );
    }
  });

  it("has all expected config provider constants and tuple fields", async function () {
    const provider = contract(DualGovernanceConfigProvider_ABI, expected.configProvider);
    const config = await client.read(provider, "getDualGovernanceConfig");
    for (const [getter, field] of [
      ["FIRST_SEAL_RAGE_QUIT_SUPPORT", "firstSealRageQuitSupport"],
      ["SECOND_SEAL_RAGE_QUIT_SUPPORT", "secondSealRageQuitSupport"],
      ["MIN_ASSETS_LOCK_DURATION", "minAssetsLockDuration"],
      ["VETO_SIGNALLING_MIN_DURATION", "vetoSignallingMinDuration"],
      ["VETO_SIGNALLING_MAX_DURATION", "vetoSignallingMaxDuration"],
      ["VETO_SIGNALLING_MIN_ACTIVE_DURATION", "vetoSignallingMinActiveDuration"],
      ["VETO_SIGNALLING_DEACTIVATION_MAX_DURATION", "vetoSignallingDeactivationMaxDuration"],
      ["VETO_COOLDOWN_DURATION", "vetoCooldownDuration"],
      ["RAGE_QUIT_EXTENSION_PERIOD_DURATION", "rageQuitExtensionPeriodDuration"],
      ["RAGE_QUIT_ETH_WITHDRAWALS_MIN_DELAY", "rageQuitEthWithdrawalsMinDelay"],
      ["RAGE_QUIT_ETH_WITHDRAWALS_MAX_DELAY", "rageQuitEthWithdrawalsMaxDelay"],
      ["RAGE_QUIT_ETH_WITHDRAWALS_DELAY_GROWTH", "rageQuitEthWithdrawalsDelayGrowth"],
    ] as const) {
      assert.equal(BigInt(await client.read(provider, getter)), BigInt(expected.config[getter]), getter);
      assert.equal(BigInt(config[field]), BigInt(expected.config[getter]), field);
    }
  });

  it("has the expected ordered core and subcommittee membership and quorums", async function () {
    const core = contract(committeeAbi, expected.coreCommittee.ADDRESS);
    assert.equal((await client.read(core, "owner")).toLowerCase(), expected.coreCommittee.OWNER.toLowerCase());
    assert.deepEqual(
      (await client.read(core, "getMembers")).map((address) => address.toLowerCase()),
      expected.coreCommittee.MEMBERS.map((address) => address.toLowerCase()),
    );
    assert.equal(await client.read(core, "getQuorum"), BigInt(expected.coreCommittee.QUORUM));
    assert.equal(await client.read(core, "getTimelockDuration"), expected.coreCommittee.TIMELOCK_DURATION);
    assert.equal((await client.read(core, "DUAL_GOVERNANCE")).toLowerCase(), expected.dualGovernance.toLowerCase());
    for (const [index, member] of expected.subCommittees.entries()) {
      const committee = contract(committeeAbi, member.ADDRESS);
      assert.equal((await client.read(committee, "owner")).toLowerCase(), member.OWNER.toLowerCase());
      assert.deepEqual(
        (await client.read(committee, "getMembers")).map((address) => address.toLowerCase()),
        member.MEMBERS.map((address) => address.toLowerCase()),
      );
      assert.equal(await client.read(committee, "getQuorum"), BigInt(member.QUORUM));
      assert.equal(
        (await client.read(committee, "TIEBREAKER_CORE_COMMITTEE")).toLowerCase(),
        expected.coreCommittee.ADDRESS.toLowerCase(),
      );
      assert.equal(member.ADDRESS.toLowerCase(), expected.coreCommittee.MEMBERS[index].toLowerCase());
    }
  });

  it("has the expected escrow immutables, signalling state and no rage quit escrow", async function () {
    for (const address of [expected.escrowMasterCopy, expected.vetoSignallingEscrow]) {
      const escrow = contract(Escrow_ABI, address);
      for (const [getter, value] of [
        ["ESCROW_MASTER_COPY", expected.escrowMasterCopy],
        ["DUAL_GOVERNANCE", expected.dualGovernance],
        ["ST_ETH", expected.st_eth],
        ["WST_ETH", expected.wst_eth],
        ["WITHDRAWAL_QUEUE", expected.withdrawal_queue],
      ] as const) {
        assert.equal((await client.read(escrow, getter)).toLowerCase(), value.toLowerCase(), `${address} ${getter}`);
      }
      assert.equal(
        BigInt(await client.read(escrow, "MAX_MIN_ASSETS_LOCK_DURATION")),
        BigInt(expected.maxMinAssetsLockDuration),
      );
      assert.equal(await client.read(escrow, "MIN_TRANSFERRABLE_ST_ETH_AMOUNT"), 100n);
      assert.equal(BigInt(await client.read(escrow, "MIN_WITHDRAWALS_BATCH_SIZE")), 4n);
    }
    const escrow = contract(Escrow_ABI, expected.vetoSignallingEscrow);
    assert.equal(
      BigInt(await client.read(escrow, "getMinAssetsLockDuration")),
      BigInt(expected.config.MIN_ASSETS_LOCK_DURATION),
    );
    assert.equal(await client.read(escrow, "getEscrowState"), 1);
    assert.equal((await client.read(dualGovernance, "getRageQuitEscrow")).toLowerCase(), zeroAddress);
  });

  it("has the expected reseal manager timelock", async function () {
    assert.equal(
      (
        await client.read(contract(resealManagerAbi, expected.resealManager), "EMERGENCY_PROTECTED_TIMELOCK")
      ).toLowerCase(),
      expected.timelock.toLowerCase(),
    );
  });
});
