import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  keccak256,
  toHex,
  zeroHash,
} from "viem";
import { LidoLocator_ABI } from "@/abi/LidoLocator.abi";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { TopUpGateway_ABI } from "@/abi/TopUpGateway.abi";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    gateway: "0x3FC2C71579D80790Aaa3fc7Be8B66ac39dC57374",
    implementation: "0xb08dBc68C521cD7A4318dc4C807a42bEB20f1106",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    circuitBreaker: "0x6019CB557978296BA3C08a7B73225C0975DFB2F7",
    resealManager: "0x7914b5a1539b97Bd0bbd155757F25FD79A522d24",
    depositor: "0x6Aa249bA53A3abcaC52F91146583B3eE2Ee4C7F5",
    minBlockDistance: 75n,
  },
  hoodi: {
    gateway: "0x10DBEb3367876826d00D21718D1d893e0fbD2956",
    implementation: "0x8621D8a402fdf2a131E38e16ac50f4C97660Fc2b",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    circuitBreaker: "0x44a5789dFeDa59cD176Ab5709ec2F4829dE4d555",
    resealManager: "0x05172CbCDb7307228F781436b327679e4DAE166B",
    depositor: "0x25636798f6E716b2e6b7dEA8ED52a45271768D7A",
    minBlockDistance: 75n,
  },
} as const;

const limits = {
  maxValidators: 32n,
  maxRootAge: 600n,
  targetBalanceGwei: 2_046_750_000_000n,
  minTopUpGwei: 2_000_000_000n,
};
const firstValidator = "0x0000000000000000000000000000000000000000000000000096000000000028";

function revertedWith(error: unknown, data: Hex): boolean {
  const revert =
    error instanceof BaseError &&
    error.walk(
      (cause) =>
        cause instanceof ContractFunctionRevertedError ||
        (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
    );
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.raw === data;
  }
  return revert instanceof Error && "data" in revert && revert.data === data;
}

describe("TopUpGateway acceptance", function () {
  let client: DevRpcClient;
  let gateway: Contract<typeof TopUpGateway_ABI>;
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
    gateway = contract(TopUpGateway_ABI, expected.gateway);
  });

  it("has the expected proxy implementation and admin", async function () {
    const proxy = contract(OssifiableProxy_ABI, gateway.address);
    assert.equal(
      (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.agent.toLowerCase(), "admin");
  });

  it("has the expected immutable beacon parameters and locator wiring", async function () {
    assert.equal(await client.read(gateway, "SLOTS_PER_EPOCH"), 32n, "slots per epoch");
    assert.equal(await client.read(gateway, "PIVOT_SLOT"), 0n, "pivot slot");
    assert.equal(await client.read(gateway, "GI_FIRST_VALIDATOR_PREV"), firstValidator, "previous validator gindex");
    assert.equal(await client.read(gateway, "GI_FIRST_VALIDATOR_CURR"), firstValidator, "current validator gindex");
    assert.equal(
      (await client.read(contract(LidoLocator_ABI, expected.locator), "topUpGateway")).toLowerCase(),
      gateway.address.toLowerCase(),
      "locator top-up gateway",
    );
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    const data = encodeErrorResult({ abi: TopUpGateway_ABI, errorName: "InvalidInitialization" });
    for (const target of [gateway, contract(TopUpGateway_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(
          target,
          "initialize",
          [
            expected.agent,
            limits.maxValidators,
            expected.minBlockDistance,
            limits.maxRootAge,
            limits.targetBalanceGwei,
            limits.minTopUpGwei,
          ],
          { from: governance.voting.address },
        ),
        (error: unknown) => revertedWith(error, data),
        `initialize ${target.address}`,
      );
    }
  });

  it("has the expected top-up limits", async function () {
    assert.equal(await client.read(gateway, "getMaxValidatorsPerTopUp"), limits.maxValidators, "max validators");
    assert.equal(await client.read(gateway, "getMinBlockDistance"), expected.minBlockDistance, "min block distance");
    assert.equal(await client.read(gateway, "getMaxRootAge"), limits.maxRootAge, "max root age");
    assert.equal(await client.read(gateway, "getTargetBalanceGwei"), limits.targetBalanceGwei, "target balance");
    assert.equal(await client.read(gateway, "getMinTopUpGwei"), limits.minTopUpGwei, "min top-up");
  });

  it("is resumed and has no future top-up timestamp", async function () {
    assert.isFalse(await client.read(gateway, "isPaused"), "paused");
    assert.isTrue(
      (await client.read(gateway, "getLastTopUpTimestamp")) <= (await client.viemClient.getBlock()).timestamp,
      "last top-up timestamp",
    );
  });

  it("has exactly the expected role holders", async function () {
    for (const [name, members] of [
      ["DEFAULT_ADMIN_ROLE", [expected.agent]],
      ["PAUSE_ROLE", [expected.circuitBreaker, expected.resealManager]],
      ["RESUME_ROLE", [expected.resealManager]],
      ["TOP_UP_ROLE", [expected.depositor]],
      ["MANAGE_LIMITS_ROLE", []],
    ] as const) {
      const role = name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(name));
      assert.equal(await client.read(gateway, "getRoleMemberCount", [role]), BigInt(members.length), `${name} count`);
      const actual = await Promise.all(
        members.map((_, index) => client.read(gateway, "getRoleMember", [role, BigInt(index)])),
      );
      assert.sameMembers(
        actual.map((address) => address.toLowerCase()),
        members.map((address) => address.toLowerCase()),
        name,
      );
    }
  });

  it("rejects unauthorized top-ups, limit changes, pauses and resumes", async function () {
    const stranger = "0x000000000000000000000000000000000000bEEF";
    const unauthorized = (name: string) => (error: unknown) =>
      revertedWith(
        error,
        encodeErrorResult({
          abi: TopUpGateway_ABI,
          errorName: "AccessControlUnauthorizedAccount",
          args: [stranger, keccak256(toHex(name))],
        }),
      );
    const emptyTopUp = {
      moduleId: 0n,
      keyIndices: [],
      operatorIds: [],
      validatorIndices: [],
      beaconRootData: { childBlockTimestamp: 0n, slot: 0n, proposerIndex: 0n },
      validatorWitness: [],
      pendingBalanceGwei: [],
    };
    await rejects(client.simulate(gateway, "topUp", [emptyTopUp], { from: stranger }), unauthorized("TOP_UP_ROLE"));
    await rejects(
      client.simulate(gateway, "setMaxValidatorsPerTopUp", [1n], { from: stranger }),
      unauthorized("MANAGE_LIMITS_ROLE"),
    );
    await rejects(
      client.simulate(gateway, "setMinBlockDistance", [1n], { from: stranger }),
      unauthorized("MANAGE_LIMITS_ROLE"),
    );
    await rejects(
      client.simulate(gateway, "setTopUpBalanceLimits", [1n, 1n], { from: stranger }),
      unauthorized("MANAGE_LIMITS_ROLE"),
    );
    await rejects(
      client.simulate(gateway, "setMaxRootAge", [1n], { from: stranger }),
      unauthorized("MANAGE_LIMITS_ROLE"),
    );
    await rejects(client.simulate(gateway, "pauseFor", [1n], { from: stranger }), unauthorized("PAUSE_ROLE"));
    await rejects(client.simulate(gateway, "resume", [], { from: stranger }), unauthorized("RESUME_ROLE"));
  });
});
