import { assert } from "chai";
import type { Context } from "mocha";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { zeroAddress } from "viem";
import { OracleReportSanityChecker_ABI } from "@/abi/OracleReportSanityChecker.abi";

const configurations = {
  mainnet: {
    checker: "0x147f8d3cf3004FAf9Bf94E88B54b6C06De507be9",
    limits: {
      annualBalanceIncreaseBPLimit: 1000n,
      simulatedShareRateDeviationBPLimit: 50n,
      maxItemsPerExtraDataTransaction: 8n,
      maxNodeOperatorsPerExtraDataItem: 24n,
      requestTimestampMargin: 7680n,
      maxPositiveTokenRebase: 750000n,
      clBalanceOraclesErrorUpperBPLimit: 50n,
      exitedEthAmountPerDayLimit: 57600n,
      appearedEthAmountPerDayLimit: 57600n,
      maxEffectiveBalanceWeightWCType01: 32n,
      maxEffectiveBalanceWeightWCType02: 2048n,
      maxBalanceExitRequestedPerReportInEth: 19200n,
      externalPendingBalanceCapEth: 300n,
      consolidationEthAmountPerDayLimit: 93375n,
      exitedValidatorEthAmountLimit: 32n,
      maxCLBalanceDecreaseBP: 360n,
    },
  },
  hoodi: {
    checker: "0xD0261b0032A00a7449ee7fbE14d3f98702996441",
    limits: {
      annualBalanceIncreaseBPLimit: 1000n,
      simulatedShareRateDeviationBPLimit: 50n,
      maxItemsPerExtraDataTransaction: 8n,
      maxNodeOperatorsPerExtraDataItem: 24n,
      requestTimestampMargin: 128n,
      maxPositiveTokenRebase: 750000n,
      clBalanceOraclesErrorUpperBPLimit: 50n,
      exitedEthAmountPerDayLimit: 57600n,
      appearedEthAmountPerDayLimit: 57600n,
      maxEffectiveBalanceWeightWCType01: 32n,
      maxEffectiveBalanceWeightWCType02: 2048n,
      maxBalanceExitRequestedPerReportInEth: 19200n,
      externalPendingBalanceCapEth: 300n,
      consolidationEthAmountPerDayLimit: 93375n,
      exitedValidatorEthAmountLimit: 32n,
      maxCLBalanceDecreaseBP: 360n,
    },
  },
} as const;

describe("OracleReportSanityChecker acceptance", function () {
  let client: DevRpcClient;
  let checker: Contract<typeof OracleReportSanityChecker_ABI>;
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
    checker = contract(OracleReportSanityChecker_ABI, expected.checker);
  });

  it("has the expected locator", async function () {
    assert.equal(
      (await client.read(checker, "getLidoLocator")).toLowerCase(),
      governance.locator.address.toLowerCase(),
      "locator",
    );
  });

  it("has all sixteen expected limits and the standalone positive rebase limit", async function () {
    assert.equal(
      await client.read(checker, "getMaxPositiveTokenRebase"),
      expected.limits.maxPositiveTokenRebase,
      "max positive token rebase",
    );
    assert.deepEqual(await client.read(checker, "getOracleReportLimits"), expected.limits, "oracle report limits");
  });

  it("has no second opinion oracle", async function () {
    assert.equal(await client.read(checker, "secondOpinionOracle"), zeroAddress, "second opinion oracle");
  });
});
