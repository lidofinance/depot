import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import {
  deps,
  fetchAbiFromEtherscan,
  lookupAddressInRegistry,
  readAbiFromFile,
  toConstantName,
} from "../../src/abi-sync/abi-source";
import { ContractInfo } from "../../src/contract-info-resolver/types";

const PROXY = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const IMPLEMENTATION = "0x89eDa99C0551d4320b56F82DDE8dF2f8D2eF81aA";

function contractInfo(name: string, abi: Abi, implementation: ContractInfo["implementation"] = null): ContractInfo {
  return { name, abi, implementation, constructorArgs: "0x", sourceCode: "", evmVersion: "", compilerVersion: "" };
}

describe("abi-source", () => {
  afterEach(() => sinon.restore());

  describe("fetchAbiFromEtherscan", () => {
    it("returns the ABI of a plain contract", async () => {
      const abi: Abi = [{ type: "function", name: "foo", stateMutability: "view", inputs: [], outputs: [] }];
      sinon.stub(deps, "resolveContractInfo").resolves(contractInfo("Plain", abi));

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, abi);
      assert.equal(resolved.contractName, "Plain");
      assert.equal(resolved.source, `Etherscan, mainnet ${PROXY} (Plain)`);
    });

    it("follows a proxy to its implementation and records both in the source", async () => {
      const implementationAbi: Abi = [
        { type: "function", name: "updateStakingModule", stateMutability: "nonpayable", inputs: [], outputs: [] },
      ];
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", [], IMPLEMENTATION));
      resolve.withArgs("mainnet", IMPLEMENTATION).resolves(contractInfo("StakingRouter", implementationAbi));

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, implementationAbi);
      assert.equal(resolved.contractName, "StakingRouter");
      assert.equal(
        resolved.source,
        `Etherscan, mainnet ${PROXY} (OssifiableProxy) → implementation ${IMPLEMENTATION} (StakingRouter)`,
      );
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
  });

  describe("lookupAddressInRegistry", () => {
    const LIBRARY = `
library MainnetAddresses {
    address internal constant STAKING_ROUTER = 0xfddf38947afb03c621c71b06c9c70bce73f12999;
    address internal constant EASY_TRACK = 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea;
}`;

    it("finds the constant by PascalCase name and checksums the address", async () => {
      sinon.stub(deps, "readFile").resolves(LIBRARY);

      assert.equal(await lookupAddressInRegistry("mainnet", "StakingRouter"), PROXY);
    });

    it("fails with a hint when the constant is missing", async () => {
      sinon.stub(deps, "readFile").resolves(LIBRARY);

      await assert.isRejected(
        lookupAddressInRegistry("mainnet", "NodeOperatorsRegistry"),
        /Constant "NODE_OPERATORS_REGISTRY" not found in contracts\/addresses\/MainnetAddresses.sol/,
      );
    });

    it("fails with a hint when the network has no registry file", async () => {
      sinon.stub(deps, "readFile").rejects(new Error("ENOENT"));

      await assert.isRejected(lookupAddressInRegistry("hoodi", "StakingRouter"), /No address registry for hoodi/);
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
