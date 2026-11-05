import { rejects } from "node:assert/strict";
import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import { deps, fetchAbiFromEtherscan, readAbiFromFile, readImplementationOnChain } from "@/src/abi-sync/abi-source";
import { ContractInfo } from "@/src/contract-info-resolver/types";

const PROXY = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const BEACON = "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea";
const IMPLEMENTATION = "0x89eDa99C0551d4320b56F82DDE8dF2f8D2eF81aA";
const UPGRADED_IMPLEMENTATION = "0xDD76927045435C7605cf6f5F978cfb8CABDb5F80";
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const ZERO_WORD = `0x${"0".repeat(64)}`;
const word = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;

const PROXY_ABI: Abi = [
  {
    type: "function",
    name: "proxy__upgradeTo",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation_", type: "address" }],
    outputs: [],
  },
];
const STAKING_ROUTER_ABI: Abi = [
  { type: "function", name: "updateStakingModule", stateMutability: "nonpayable", inputs: [], outputs: [] },
];
const UPGRADEABLE_BEACON_ABI: Abi = [
  {
    type: "function",
    name: "implementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [{ name: "implementation", type: "address", indexed: true }],
    anonymous: false,
  },
];

function contractInfo(name: string, abi: Abi, implementation: ContractInfo["implementation"] = null): ContractInfo {
  return { name, abi, implementation };
}

describe("abi-source", () => {
  afterEach(() => sinon.restore());

  describe("fetchAbiFromEtherscan", () => {
    let readImplementationOnChain: sinon.SinonStub;

    beforeEach(() => {
      readImplementationOnChain = sinon.stub(deps, "readImplementationOnChain").resolves(null);
    });

    it("follows a proxy to the implementation reported by the chain, ignoring a stale Etherscan field", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(UPGRADED_IMPLEMENTATION);

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, STAKING_ROUTER_ABI);
      assert.equal(resolved.contractName, "StakingRouter");
      assert.equal(
        resolved.source,
        `Etherscan, mainnet ${PROXY} (OssifiableProxy) → implementation ${UPGRADED_IMPLEMENTATION} (StakingRouter)`,
      );
      assert.isFalse(resolve.calledWith("mainnet", IMPLEMENTATION));
    });

    it("never uses Etherscan's implementation field when the chain exposes none", async () => {
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /exposes no implementation on chain/);
    });

    it("stops on a proxy chain that loops back", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      resolve.withArgs("mainnet", IMPLEMENTATION).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(IMPLEMENTATION);
      readImplementationOnChain.withArgs("mainnet", IMPLEMENTATION, true).resolves(PROXY.toLowerCase());

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /loops back to/);
    });
  });

  describe("fetchAbiFromEtherscan at the RPC boundary", () => {
    let send: sinon.SinonStub;

    beforeEach(() => {
      deps.rpcClients.clear();
      send = sinon.stub();
      sinon.stub(deps, "createRpcClient").resolves({ send });
    });

    afterEach(() => deps.rpcClients.clear());

    it("resolves a BeaconProxy through its EIP-1967 beacon", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("BeaconProxy", []));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      send.withArgs("eth_getStorageAt", [PROXY, EIP1967_IMPLEMENTATION_SLOT, "latest"]).resolves(ZERO_WORD);
      send.withArgs("eth_getStorageAt", [PROXY, EIP1967_BEACON_SLOT, "latest"]).resolves(word(BEACON));
      send
        .withArgs("eth_call", [{ to: BEACON, data: IMPLEMENTATION_SELECTOR }, "latest"])
        .resolves(word(UPGRADED_IMPLEMENTATION));
      send
        .withArgs("eth_getStorageAt", [UPGRADED_IMPLEMENTATION, EIP1967_IMPLEMENTATION_SLOT, "latest"])
        .resolves(ZERO_WORD);
      send.withArgs("eth_getStorageAt", [UPGRADED_IMPLEMENTATION, EIP1967_BEACON_SLOT, "latest"]).resolves(ZERO_WORD);

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, STAKING_ROUTER_ABI);
      assert.equal(resolved.contractName, "StakingRouter");
      assert.equal(
        resolved.source,
        `Etherscan, mainnet ${PROXY} (BeaconProxy) → implementation ${UPGRADED_IMPLEMENTATION} (StakingRouter)`,
      );
    });

    it("does not unwrap a standalone UpgradeableBeacon", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", BEACON).resolves(contractInfo("UpgradeableBeacon", UPGRADEABLE_BEACON_ABI));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      send.withArgs("eth_getStorageAt", [BEACON, EIP1967_IMPLEMENTATION_SLOT, "latest"]).resolves(ZERO_WORD);
      send.withArgs("eth_getStorageAt", [BEACON, EIP1967_BEACON_SLOT, "latest"]).resolves(ZERO_WORD);
      send
        .withArgs("eth_call", [{ to: BEACON, data: IMPLEMENTATION_SELECTOR }, "latest"])
        .resolves(word(UPGRADED_IMPLEMENTATION));
      send
        .withArgs("eth_getStorageAt", [UPGRADED_IMPLEMENTATION, EIP1967_IMPLEMENTATION_SLOT, "latest"])
        .resolves(ZERO_WORD);

      const resolved = await fetchAbiFromEtherscan("mainnet", BEACON);

      assert.deepEqual(resolved.abi, UPGRADEABLE_BEACON_ABI);
      assert.equal(resolved.contractName, "UpgradeableBeacon");
      assert.equal(resolved.source, `Etherscan, mainnet ${BEACON} (UpgradeableBeacon)`);
    });
  });

  describe("readImplementationOnChain", () => {
    let send: sinon.SinonStub;

    beforeEach(() => {
      deps.rpcClients.clear();
      send = sinon.stub();
      sinon.stub(deps, "createRpcClient").resolves({ send });
    });

    afterEach(() => deps.rpcClients.clear());

    it("reads the EIP-1967 slot and checksums the address", async () => {
      send.withArgs("eth_getStorageAt").resolves(word(UPGRADED_IMPLEMENTATION));

      assert.equal(await readImplementationOnChain("mainnet", PROXY, true), UPGRADED_IMPLEMENTATION);
    });

    it("falls back to implementation() for a proxy-looking contract with an empty slot", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);
      send.withArgs("eth_call").resolves(word(IMPLEMENTATION));

      assert.equal(await readImplementationOnChain("mainnet", PROXY, true), IMPLEMENTATION);
    });

    it("treats a reverting implementation() as no implementation", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);
      send.withArgs("eth_call").rejects(Object.assign(new Error("execution reverted"), { code: 3 }));

      assert.isNull(await readImplementationOnChain("mainnet", PROXY, true));
    });

    it("propagates a network failure of implementation()", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);
      send.withArgs("eth_call").rejects(new Error("HTTP request failed"));

      await assert.isRejected(readImplementationOnChain("mainnet", PROXY, true), /HTTP request failed/);
    });
  });

  describe("readAbiFromFile", () => {
    const invalidAbis: [string, unknown][] = [
      ["unknown item kind", [{ type: "unknown" }]],
      [
        "invalid nested tuple component",
        [
          {
            type: "error",
            name: "Failed",
            inputs: [{ type: "tuple[][2]", components: [{ type: "tuple", components: [{}] }] }],
          },
        ],
      ],
    ];

    for (const [label, abi] of invalidAbis) {
      it(`rejects ${label} with file context and a cause`, async () => {
        sinon.stub(deps, "readFile").resolves(JSON.stringify(abi));

        await rejects(
          readAbiFromFile("Invalid.json"),
          (error: unknown) =>
            error instanceof Error &&
            /Invalid\.json/.test(error.message) &&
            "cause" in error &&
            error.cause instanceof Error,
        );
      });
    }

    it("accepts variants, nested tuple arrays and legacy mutability without dropping metadata", async () => {
      const abi = [
        { type: "constructor", inputs: [], payable: true },
        { type: "fallback", payable: false },
        { type: "receive", stateMutability: "payable" },
        {
          type: "event",
          name: "Changed",
          inputs: [{ type: "tuple[][2]", components: [{ type: "tuple", components: [{ type: "uint256[0][]" }] }] }],
        },
        { type: "error", name: "Failed", inputs: [{ type: "fixed128x18" }] },
        { type: "function", name: "get", inputs: [], outputs: [], constant: true, customMetadata: "retained" },
        { type: "function", name: "set", inputs: [], outputs: [], payable: false },
        { type: "function", name: "deposit", inputs: [], outputs: [], payable: true },
      ];
      sinon.stub(deps, "readFile").resolves(JSON.stringify({ abi }));

      const resolved = await readAbiFromFile("Legacy.json");

      assert.deepEqual<unknown>(resolved.abi, abi);
    });
  });
});
