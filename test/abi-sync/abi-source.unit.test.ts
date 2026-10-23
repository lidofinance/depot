import { fileURLToPath } from "node:url";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import {
  addressFromWord,
  deps,
  fetchAbiFromEtherscan,
  lookupAddressInRegistry,
  readAbiFromFile,
  readImplementationOnChain,
  toConstantName,
} from "../../src/abi-sync/abi-source";
import { ContractInfo } from "../../src/contract-info-resolver/types";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const PROXY = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const BEACON = "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea";
const IMPLEMENTATION = "0x89eDa99C0551d4320b56F82DDE8dF2f8D2eF81aA";
const UPGRADED_IMPLEMENTATION = "0xDD76927045435C7605cf6f5F978cfb8CABDb5F80";
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const ZERO_WORD = `0x${"0".repeat(64)}`;
const word = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;

const PLAIN_ABI: Abi = [{ type: "function", name: "foo", stateMutability: "view", inputs: [], outputs: [] }];
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
  return { name, abi, implementation, constructorArgs: "0x", sourceCode: "", evmVersion: "", compilerVersion: "" };
}

describe("abi-source", () => {
  afterEach(() => sinon.restore());

  describe("fetchAbiFromEtherscan", () => {
    let readImplementationOnChain: sinon.SinonStub;

    beforeEach(() => {
      readImplementationOnChain = sinon.stub(deps, "readImplementationOnChain").resolves(null);
    });

    it("returns the ABI of a plain contract", async () => {
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("Plain", PLAIN_ABI));

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, PLAIN_ABI);
      assert.equal(resolved.contractName, "Plain");
      assert.equal(resolved.source, `Etherscan, mainnet ${PROXY} (Plain)`);
      assert.isTrue(readImplementationOnChain.calledOnceWithExactly("mainnet", PROXY, false));
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

    it("propagates an RPC failure instead of guessing", async () => {
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));
      readImplementationOnChain.rejects(new Error("No mainnet RPC to read the implementation"));

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /No mainnet RPC/);
    });

    it("follows a chain of proxies", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      resolve.withArgs("mainnet", IMPLEMENTATION).resolves(contractInfo("BeaconProxy", []));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(IMPLEMENTATION);
      readImplementationOnChain.withArgs("mainnet", IMPLEMENTATION, true).resolves(UPGRADED_IMPLEMENTATION);

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.equal(resolved.contractName, "StakingRouter");
      assert.equal(
        resolved.source,
        `Etherscan, mainnet ${PROXY} (OssifiableProxy) → implementation ${IMPLEMENTATION} (BeaconProxy)` +
          ` → implementation ${UPGRADED_IMPLEMENTATION} (StakingRouter)`,
      );
    });

    it("returns the proxy's own ABI when asked for it", async () => {
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY, { proxyAbi: true });

      assert.deepEqual(resolved.abi, PROXY_ABI);
      assert.equal(resolved.contractName, "OssifiableProxy");
      assert.equal(resolved.source, `Etherscan, mainnet ${PROXY} (OssifiableProxy), proxy ABI`);
      assert.isFalse(readImplementationOnChain.called);
    });

    it("fails with a hint when a proxy-looking contract has no resolvable implementation", async () => {
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("OssifiableProxy", PROXY_ABI));

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /looks like a proxy.*--proxyAbi/);
    });

    it("checksums the implementation address in the source line", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(UPGRADED_IMPLEMENTATION);

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.include(resolved.source, `→ implementation ${UPGRADED_IMPLEMENTATION} (StakingRouter)`);
    });

    it("names the proxy when its implementation is not verified", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(IMPLEMENTATION);
      resolve
        .withArgs("mainnet", IMPLEMENTATION)
        .rejects(new Error(`Contract is not verified: mainnet ${IMPLEMENTATION}`));

      await assert.isRejected(
        fetchAbiFromEtherscan("mainnet", PROXY),
        new RegExp(`Implementation ${IMPLEMENTATION} of proxy ${PROXY} on mainnet is not verified.*--from-file`),
      );
    });

    it("passes other implementation lookup failures through unchanged", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(IMPLEMENTATION);
      resolve.withArgs("mainnet", IMPLEMENTATION).rejects(new Error("Rate limit reached, tried 6 times"));

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /^Rate limit reached, tried 6 times$/);
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
      assert.deepEqual(send.args.slice(0, 3), [
        ["eth_getStorageAt", [PROXY, EIP1967_IMPLEMENTATION_SLOT, "latest"]],
        ["eth_getStorageAt", [PROXY, EIP1967_BEACON_SLOT, "latest"]],
        ["eth_call", [{ to: BEACON, data: IMPLEMENTATION_SELECTOR }, "latest"]],
      ]);
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
      assert.isFalse(send.calledWith("eth_call"));
    });
  });

  describe("readImplementationOnChain", () => {
    let send: sinon.SinonStub;
    let createRpcClient: sinon.SinonStub;

    beforeEach(() => {
      deps.rpcClients.clear();
      send = sinon.stub();
      createRpcClient = sinon.stub(deps, "createRpcClient").resolves({ send });
    });

    afterEach(() => deps.rpcClients.clear());

    it("reads the EIP-1967 slot and checksums the address", async () => {
      send.withArgs("eth_getStorageAt").resolves(word(UPGRADED_IMPLEMENTATION));

      assert.equal(await readImplementationOnChain("mainnet", PROXY, true), UPGRADED_IMPLEMENTATION);
      assert.isTrue(send.calledOnce, "no implementation() call when the slot is set");
      assert.deepEqual(send.firstCall.args[1], [PROXY, EIP1967_IMPLEMENTATION_SLOT, "latest"]);
    });

    it("falls back to implementation() for a proxy-looking contract with an empty slot", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);
      send.withArgs("eth_call").resolves(word(IMPLEMENTATION));

      assert.equal(await readImplementationOnChain("mainnet", PROXY, true), IMPLEMENTATION);
      assert.deepEqual(send.thirdCall.args[1], [{ to: PROXY, data: IMPLEMENTATION_SELECTOR }, "latest"]);
    });

    it("does not call implementation() on a contract that does not look like a proxy", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);

      assert.isNull(await readImplementationOnChain("mainnet", PROXY, false));
      assert.isTrue(send.calledTwice);
      assert.isFalse(send.calledWith("eth_call"));
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

    it("names the network and address when no RPC client can be created, and retries next time", async () => {
      createRpcClient.onFirstCall().rejects(new Error('required ENV variable "ETH_MAINNET_RPC_URL" is not set'));
      createRpcClient.onSecondCall().resolves({ send });
      send.withArgs("eth_getStorageAt").resolves(word(IMPLEMENTATION));

      await assert.isRejected(
        readImplementationOnChain("mainnet", PROXY, true),
        /No mainnet RPC to read the implementation of 0xFdDf.*ETH_MAINNET_RPC_URL/,
      );
      assert.equal(await readImplementationOnChain("mainnet", PROXY, true), IMPLEMENTATION);
      assert.isTrue(createRpcClient.calledTwice, "a failed connection is not cached");
    });

    it("creates one client per network", async () => {
      send.withArgs("eth_getStorageAt").resolves(ZERO_WORD);

      await readImplementationOnChain("mainnet", PROXY, false);
      await readImplementationOnChain("mainnet", IMPLEMENTATION, false);
      await readImplementationOnChain("hoodi", PROXY, false);

      assert.deepEqual(
        createRpcClient.args.map(([networkName]) => networkName),
        ["mainnet", "hoodi"],
      );
    });
  });

  describe("addressFromWord", () => {
    it("extracts and checksums the address from a storage word", () => {
      assert.equal(addressFromWord(word(UPGRADED_IMPLEMENTATION)), UPGRADED_IMPLEMENTATION);
    });

    it("returns null for a zero word or anything that is not a 32-byte word", () => {
      assert.isNull(addressFromWord(ZERO_WORD));
      assert.isNull(addressFromWord("0x"));
      assert.isNull(addressFromWord(UPGRADED_IMPLEMENTATION));
    });
  });

  describe("readAbiFromFile", () => {
    it("accepts a bare ABI array", async () => {
      sinon
        .stub(deps, "readFile")
        .resolves('[{"type":"function","name":"foo","stateMutability":"view","inputs":[],"outputs":[]}]');

      const resolved = await readAbiFromFile("./abis/Foo.json");

      assert.equal(resolved.abi.length, 1);
      assert.equal(resolved.contractName, "Foo");
      assert.equal(resolved.source, "file ./abis/Foo.json");
    });

    it("accepts a compiler artifact with an abi field", async () => {
      sinon.stub(deps, "readFile").resolves('{"contractName":"Foo","abi":[]}');

      const resolved = await readAbiFromFile("Foo.json");

      assert.deepEqual(resolved.abi, []);
    });

    it("rejects a file without an ABI", async () => {
      sinon.stub(deps, "readFile").resolves('{"bytecode":"0x"}');

      await assert.isRejected(readAbiFromFile("Foo.json"), /neither an ABI array nor an artifact/);
    });

    it("includes the input file and parse cause for malformed JSON", async () => {
      sinon.stub(deps, "readFile").resolves("{");

      await rejects(
        readAbiFromFile("./broken.json"),
        (error: unknown) =>
          error instanceof Error &&
          /broken\.json/.test(error.message) &&
          "cause" in error &&
          error.cause instanceof SyntaxError,
      );
    });

    const invalidAbis: [string, unknown][] = [
      ["null artifact", null],
      ["missing item kind", [{}]],
      ["unknown item kind", [{ type: "unknown" }]],
      ["null item", [null]],
      ["missing inputs", [{ type: "function", name: "foo", outputs: [], stateMutability: "nonpayable" }]],
      [
        "missing parameter type",
        [{ type: "function", name: "foo", inputs: [{ name: "x" }], outputs: [], stateMutability: "nonpayable" }],
      ],
      ["missing outputs", [{ type: "function", name: "foo", inputs: [], stateMutability: "view" }]],
      ["invalid output", [{ type: "function", name: "foo", inputs: [], outputs: [null], stateMutability: "view" }]],
      ["missing event inputs", [{ type: "event", name: "Changed" }]],
      ["invalid event parameter", [{ type: "event", name: "Changed", inputs: [{ type: "address", indexed: "yes" }] }]],
      ["missing error name", [{ type: "error", inputs: [] }]],
      ["invalid error parameter", [{ type: "error", name: "Failed", inputs: [{}] }]],
      ["missing tuple components", [{ type: "error", name: "Failed", inputs: [{ type: "tuple[][2]" }] }]],
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
      [
        "invalid internalType",
        [{ type: "error", name: "Failed", inputs: [{ type: "tuple", internalType: 1, components: [] }] }],
      ],
      ["invalid mutability", [{ type: "function", name: "foo", inputs: [], outputs: [], stateMutability: "invalid" }]],
      ["invalid legacy flag", [{ type: "function", name: "foo", inputs: [], outputs: [], constant: "false" }]],
      ["nonpayable receive", [{ type: "receive", stateMutability: "nonpayable" }]],
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

  describe("lookupAddressInRegistry", () => {
    const LIBRARY = `
library MainnetAddresses {
    address internal constant STAKING_ROUTER = 0xfddf38947afb03c621c71b06c9c70bce73f12999;
    address internal constant EASY_TRACK = 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea;
}`;

    it("reads the mainnet Voting address from the real library", async () => {
      assert.equal(
        await lookupAddressInRegistry("mainnet", "Voting", PROJECT_ROOT),
        "0x2e59A20f205bB85a89C53f1936454680651E618e",
      );
    });

    it("reads the Hoodi Voting address from the real library", async () => {
      assert.equal(
        await lookupAddressInRegistry("hoodi", "Voting", PROJECT_ROOT),
        "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
      );
    });

    it("finds the constant by PascalCase name and checksums the address", async () => {
      sinon.stub(deps, "readFile").resolves(LIBRARY);

      assert.equal(await lookupAddressInRegistry("mainnet", "StakingRouter", PROJECT_ROOT), PROXY);
    });

    it("fails with a hint when the constant is missing", async () => {
      sinon.stub(deps, "readFile").resolves(LIBRARY);

      await assert.isRejected(
        lookupAddressInRegistry("mainnet", "NodeOperatorsRegistry", PROJECT_ROOT),
        /Constant "NODE_OPERATORS_REGISTRY" not found in .*contracts\/addresses\/MainnetAddresses.sol/,
      );
    });

    it("fails with a hint when the network has no registry file", async () => {
      sinon.stub(deps, "readFile").rejects(new Error("ENOENT"));

      await assert.isRejected(
        lookupAddressInRegistry("hoodi", "StakingRouter", PROJECT_ROOT),
        /No address registry for hoodi/,
      );
    });
  });

  describe("toConstantName", () => {
    it("converts PascalCase to SCREAMING_SNAKE_CASE", () => {
      assert.equal(toConstantName("StakingRouter"), "STAKING_ROUTER");
      assert.equal(toConstantName("NodeOperatorsRegistry"), "NODE_OPERATORS_REGISTRY");
      assert.equal(toConstantName("ACL"), "ACL");
      assert.equal(toConstantName("LDO"), "LDO");
      assert.equal(toConstantName("CSModule"), "CS_MODULE");
      assert.equal(toConstantName("WstETH"), "WST_ETH");
    });
  });
});
