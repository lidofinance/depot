import { TxTracer } from "./tx-tracer";
import sinon from "sinon";
import { assert } from "../common/assert";

describe("TxTracer", () => {
  class MockTraceStrategy {
    async trace() {
      return [];
    }
  }
  const mockContractInfo = {
    name: "MockContract",
    abi: {} as any,
    compilerVersion: "v0.8.0",
    constructorArgs: "0x456" as any,
    evmVersion: "istanbul",
    implementation: null,
    sourceCode: "",
  };

  it("resolves contracts for given addresses", async () => {
    const mockResolver = {
      resolve: sinon.stub().resolves(mockContractInfo),
      cache: {
        get: sinon.stub().resolves(null),
        set: sinon.stub().resolves(),
      },
      provider: {
        request: sinon.stub().resolves(mockContractInfo),
      },
    };
    const tracer = new TxTracer(new MockTraceStrategy(), mockResolver);

    const result = await tracer["resolveContracts"](1n, ["0x123"]);

    assert.deepEqual(result, { "0x123": mockContractInfo });
  });

  it("resolves contracts with implementation addresses", async () => {
    const mockImplementationInfo = {
      name: "ImplementationContract",
      abi: {} as any,
      compilerVersion: "v0.8.0",
      constructorArgs: "" as any,
      evmVersion: "istanbul",
      implementation: null,
      sourceCode: "",
    };
    mockContractInfo.implementation = "0x456" as any;
    const mockResolver = {
      resolve: sinon.stub().onFirstCall().resolves(mockContractInfo).onSecondCall().resolves(mockImplementationInfo),
      cache: {
        get: sinon.stub().resolves(null),
        set: sinon.stub().resolves(),
      },
      provider: {
        request: sinon.stub().resolves(mockContractInfo),
      },
    };
    const tracer = new TxTracer(new MockTraceStrategy(), mockResolver);

    const result = await tracer["resolveContracts"](1n, ["0x123"]);

    assert.deepEqual(result, { "0x123": mockImplementationInfo });
  });

  it("handles errors during contract resolution", async () => {
    const mockResolver = {
      resolve: sinon.stub().rejects(new Error("Resolution error")),
      cache: {
        get: sinon.stub().resolves(null),
        set: sinon.stub().resolves(),
      },
      provider: {
        request: sinon.stub().resolves(mockContractInfo),
      },
    };
    const tracer = new TxTracer(new MockTraceStrategy(), mockResolver);
    const consoleError = sinon.stub(console, "error");

    const result = await tracer["resolveContracts"](1n, ["0x123"]);

    assert.deepEqual(result, {});
    assert.isTrue(
      consoleError.calledWith("Failed to resolve contract info for address 0x123: Error: Resolution error"),
    );
  });

  it("returns empty result if no contractInfoResolver is provided", async () => {
    const tracer = new TxTracer(new MockTraceStrategy(), null);

    const result = await tracer["resolveContracts"](1n, ["0x123"]);

    assert.deepEqual(result, {});
  });
});
