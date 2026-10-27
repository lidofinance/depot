import sinon from "sinon";
import { assert } from "../../../src/common/assert";
import { ContractInfoResolver } from "../../../src/contract-info-resolver/contract-info-resolver";

const NETWORK_NAME = "mainnet";
const FLATTENED_CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

describe("ContractInfoResolver", () => {
  const mockResponse = {
    name: "Flattened",
    abi: [],
    compilerVersion: "v0.6.12+commit.27d51765",
    constructorArgs: "000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84",
    evmVersion: "Default",
    implementation: null,
    sourceCode: "contract A {}",
  };

  const mockProvider = {
    request: sinon.stub().resolves(mockResponse),
  };

  const mockCache = {
    get: sinon.stub().resolves(null),
    set: sinon.stub().resolves(),
  };

  beforeEach(() => {
    mockProvider.request.resetBehavior();
    mockCache.get.resetBehavior();
    mockCache.set.resetBehavior();
    mockProvider.request.resolves(mockResponse);
    mockCache.get.resolves(null);
    mockCache.set.resolves();
    ContractInfoResolver.etherscanProvider = mockProvider as any;
    ContractInfoResolver.cache = mockCache as any;
  });

  afterEach(() => {
    mockCache.get.resetHistory();
    mockCache.set.resetHistory();
    mockProvider.request.resetHistory();
    ContractInfoResolver.etherscanProvider = undefined;
    ContractInfoResolver.cache = undefined;
  });

  it("resolves contract info and caches the result", async () => {
    const res = await ContractInfoResolver.resolve(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(res, mockResponse as any);
    assert.isTrue(mockProvider.request.calledOnceWithExactly(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS));
    assert.isTrue(mockCache.set.calledOnceWithExactly(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS, mockResponse));
  });

  it("returns cached contract info if available", async () => {
    mockCache.get.resolves(mockResponse);

    const res = await ContractInfoResolver.resolve(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(res, mockResponse as any);
    assert.isTrue(mockProvider.request.notCalled);
    assert.isTrue(mockCache.set.notCalled);
  });

  it("throws an error if provider resolve fails", async () => {
    mockProvider.request.rejects(new Error("Provider error"));

    await assert.isRejected(ContractInfoResolver.resolve(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS), "Provider error");
  });

  it("does not use cache when cache is disabled", async () => {
    ContractInfoResolver.cache = undefined;

    const res = await ContractInfoResolver.resolve(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(res, mockResponse as any);
    assert.isTrue(mockProvider.request.calledOnce);
    assert.isTrue(mockCache.get.notCalled);
    assert.isTrue(mockCache.set.notCalled);
  });

  it("throws if etherscan provider is not configured", async () => {
    ContractInfoResolver.etherscanProvider = undefined;

    await assert.isRejected(
      ContractInfoResolver.resolve(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS),
      "Etherscan Tokens wasn't set",
    );
  });
});
