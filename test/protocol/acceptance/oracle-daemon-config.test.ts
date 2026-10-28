import { assert } from "chai";
import type { Context } from "mocha";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { OracleDaemonConfig_ABI } from "@/abi/OracleDaemonConfig.abi";

const configurations = {
  mainnet: {
    daemon: "0xbf05A929c3D7885a6aeAd833a992dA6E5ac23b09",
    values: {
      NORMALIZED_CL_REWARD_PER_EPOCH: 64n,
      NORMALIZED_CL_REWARD_MISTAKE_RATE_BP: 1000n,
      REBASE_CHECK_NEAREST_EPOCH_DISTANCE: 1n,
      REBASE_CHECK_DISTANT_EPOCH_DISTANCE: 23n,
      PREDICTION_DURATION_IN_SLOTS: 50400n,
      FINALIZATION_MAX_NEGATIVE_REBASE_EPOCH_SHIFT: 2250n,
      EXIT_EVENTS_LOOKBACK_WINDOW_IN_SLOTS: 100800n,
    },
  },
  hoodi: {
    daemon: "0x2a833402e3F46fFC1ecAb3598c599147a78731a9",
    values: {
      NORMALIZED_CL_REWARD_PER_EPOCH: 64n,
      NORMALIZED_CL_REWARD_MISTAKE_RATE_BP: 1000n,
      REBASE_CHECK_NEAREST_EPOCH_DISTANCE: 1n,
      REBASE_CHECK_DISTANT_EPOCH_DISTANCE: 2n,
      PREDICTION_DURATION_IN_SLOTS: 50400n,
      FINALIZATION_MAX_NEGATIVE_REBASE_EPOCH_SHIFT: 1350n,
      EXIT_EVENTS_LOOKBACK_WINDOW_IN_SLOTS: 100800n,
    },
  },
} as const;

describe("OracleDaemonConfig acceptance", function () {
  let client: DevRpcClient;
  let daemon: Contract<typeof OracleDaemonConfig_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    expected = configurations[network];
    daemon = contract(OracleDaemonConfig_ABI, expected.daemon);
  });

  it("has the seven expected daemon configuration values", async function () {
    const keys = Object.keys(expected.values);
    const values = await client.read(daemon, "getList", [keys]);
    const actual = Object.fromEntries(keys.map((key, index) => [key, BigInt(values[index])]));
    assert.deepEqual(actual, expected.values, "daemon configuration");
  });
});
