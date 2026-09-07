import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import { deps, syncAbi } from "../../src/abi-sync";
import { deps as sourceDeps } from "../../src/abi-sync/abi-source";
import { NetworkName } from "../../src/network";

const ADDRESS = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const ABI: Abi = [
  {
    type: "function",
    name: "setManager",
    stateMutability: "nonpayable",
    inputs: [{ name: "manager_", type: "address" }],
    outputs: [],
  },
];

describe("syncAbi", () => {
  let writeFile: sinon.SinonStub;
  let formatSolidity: sinon.SinonStub;
  let resolveAbi: sinon.SinonStub;

  beforeEach(() => {
    resolveAbi = sinon.stub(deps, "resolveAbi").resolves({ abi: ABI, contractName: "OracleRouter", source: "test" });
    writeFile = sinon.stub(deps, "writeFile").resolves();
    formatSolidity = sinon
      .stub(deps, "formatSolidity")
      .callsFake((code: string) => Promise.resolve(`${code}// forge\n`));
  });

  afterEach(() => sinon.restore());

  it("writes the ABI module and the interface formatted with forge", async () => {
    const result = await syncAbi({ name: "OracleRouter", networkName: "mainnet", address: ADDRESS });

    assert.deepEqual(result, {
      source: "test",
      contractName: "OracleRouter",
      abiPath: "abi/OracleRouter.abi.ts",
      solPath: "contracts/interfaces/IOracleRouter.sol",
    });
    assert.deepEqual(
      writeFile.args.map(([filePath]) => filePath),
      ["abi/OracleRouter.abi.ts", "contracts/interfaces/IOracleRouter.sol"],
    );
    assert.include(formatSolidity.firstCall.args[0], "function setManager(address manager_) external;");
    assert.equal(writeFile.secondCall.args[1], `${formatSolidity.firstCall.args[0]}// forge\n`);
  });

  it("writes nothing when the formatter fails", async () => {
    formatSolidity.rejects(new Error("forge fmt failed (Foundry must be installed)"));

    await assert.isRejected(
      syncAbi({ name: "OracleRouter", networkName: "mainnet", address: ADDRESS }),
      /Foundry must be installed/,
    );
    assert.isFalse(writeFile.called);
  });

  it("writes only the ABI module with skipSol", async () => {
    const result = await syncAbi({ name: "OracleRouter", networkName: "mainnet", address: ADDRESS, skipSol: true });

    assert.isNull(result.solPath);
    assert.isTrue(writeFile.calledOnceWith("abi/OracleRouter.abi.ts"));
    assert.isFalse(formatSolidity.called);
  });

  it("passes the proxy ABI switch to the resolver", async () => {
    await syncAbi({ name: "OssifiableProxy", networkName: "hoodi", address: ADDRESS, proxyAbi: true });

    assert.equal(resolveAbi.firstCall.args[0].proxyAbi, true);
  });

  it("rejects a name that is not PascalCase", async () => {
    await assert.isRejected(syncAbi({ name: "oracleRouter", networkName: "mainnet", address: ADDRESS }), /PascalCase/);
    assert.isFalse(writeFile.called);
  });
});

describe("syncAbi address selection", () => {
  beforeEach(() => {
    sinon.stub(sourceDeps, "resolveContractInfo").resolves({
      name: "Voting",
      abi: ABI,
      implementation: null,
      constructorArgs: "0x",
      sourceCode: "",
      evmVersion: "",
      compilerVersion: "",
    });
    sinon.stub(sourceDeps, "readImplementationOnChain").resolves(null);
    sinon.stub(deps, "writeFile").resolves();
  });

  afterEach(() => sinon.restore());

  const networks: NetworkName[] = ["mainnet", "hoodi"];
  for (const networkName of networks) {
    it(`prefers an explicit address over the ${networkName} library`, async () => {
      const { source } = await syncAbi({ name: "Voting", networkName, address: ADDRESS, skipSol: true });

      assert.equal(source, `Etherscan, ${networkName} ${ADDRESS} (Voting)`);
    });
  }

  it("accepts an explicit address for a contract outside the shared infrastructure", async () => {
    const { source } = await syncAbi({ name: "OracleRouter", networkName: "hoodi", address: ADDRESS, skipSol: true });

    assert.equal(source, `Etherscan, hoodi ${ADDRESS} (Voting)`);
  });
});
