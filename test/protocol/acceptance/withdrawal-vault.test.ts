import { assert } from "chai";
import type { Context } from "mocha";
import { rejects } from "node:assert/strict";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult, maxUint256, parseAbi } from "viem";
import { contract, type Contract } from "@/src/contracts";
import { createDevRpcClient, DevRpcClient } from "@/src/network";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const vaultAbi = parseAbi([
  "function implementation() view returns (address)",
  "function proxy_getAdmin() view returns (address)",
  "function getContractVersion() view returns (uint256)",
  "function initialize()",
  "function finalizeUpgrade_v3()",
  "function LIDO() view returns (address)",
  "function TREASURY() view returns (address)",
  "function TRIGGERABLE_WITHDRAWALS_GATEWAY() view returns (address)",
  "error UnexpectedContractVersion(uint256 expected, uint256 received)",
]);

const configurations = {
  mainnet: {
    vault: "0xB9D7934878B5FB9610B3fE8A5e441e8fad7E293f",
    implementation: "0xfB4521BD151BFB45DB6045D2d07e58e0f597e340",
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    gateway: "0xDC00116a0D3E064427dA2600449cfD2566B3037B",
  },
  hoodi: {
    vault: "0x4473dCDDbf77679A643BdB654dbd86D67F8d32f2",
    implementation: "0x6724DaD16f7b05157dF72783F99cA6B813742330",
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    gateway: "0x6679090D92b08a2a686eF8614feECD8cDFE209db",
  },
} as const;

describe("WithdrawalVault acceptance", function () {
  let client: DevRpcClient;
  let vault: Contract<typeof vaultAbi>;
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
    vault = contract(vaultAbi, expected.vault);
  });

  it("has the expected proxy implementation and admin", async function () {
    assert.equal(
      (await client.read(vault, "implementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(vault, "proxy_getAdmin")).toLowerCase(), expected.admin.toLowerCase(), "admin");
  });

  it("has the expected contract version", async function () {
    assert.equal(await client.read(vault, "getContractVersion"), 3n, "contract version");
  });

  it("cannot initialize or finalize the proxy or initialize the petrified implementation again", async function () {
    for (const [target, method, received, required] of [
      [vault, "initialize", 3n, 0n],
      [vault, "finalizeUpgrade_v3", 3n, 2n],
      [contract(vaultAbi, expected.implementation), "initialize", maxUint256, 0n],
    ] as const) {
      const expectedRevert = encodeErrorResult({
        abi: vaultAbi,
        errorName: "UnexpectedContractVersion",
        args: [received, required],
      });
      await rejects(
        client.simulate(target, method, [], { from: governance.voting.address }),
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
        `${method} ${target.address}`,
      );
    }
  });

  it("has the expected Lido, treasury and gateway connections", async function () {
    assert.equal((await client.read(vault, "LIDO")).toLowerCase(), expected.lido.toLowerCase(), "Lido");
    assert.equal((await client.read(vault, "TREASURY")).toLowerCase(), expected.admin.toLowerCase(), "treasury");
    assert.equal(
      (await client.read(vault, "LIDO")).toLowerCase(),
      (await client.read(governance.locator, "lido")).toLowerCase(),
      "locator Lido",
    );
    assert.equal(
      (await client.read(vault, "TREASURY")).toLowerCase(),
      (await client.read(governance.locator, "treasury")).toLowerCase(),
      "locator treasury",
    );
    assert.equal(
      (await client.read(vault, "TRIGGERABLE_WITHDRAWALS_GATEWAY")).toLowerCase(),
      expected.gateway.toLowerCase(),
      "triggerable withdrawals gateway",
    );
    assert.equal(
      (await client.read(vault, "TRIGGERABLE_WITHDRAWALS_GATEWAY")).toLowerCase(),
      (await client.read(governance.locator, "triggerableWithdrawalsGateway")).toLowerCase(),
      "locator triggerable withdrawals gateway",
    );
  });
});
