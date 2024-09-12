import { ContractTransactionReceipt } from "ethers";
import { TxTracer } from "./tx-tracer";
import { assert } from "../common/assert";
import sinon from "sinon";
import providers from "../providers";

describe("TxTracer", () => {
  beforeEach(() => {
    sinon.stub(providers, "chainId").resolves(1n);
    sinon.stub(providers, "provider").returns({ getNetwork: sinon.stub().resolves({ chainId: 1 }) } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("traces transaction and resolves contracts with implementation addresses", async () => {
    const mockTraceStrategy = {
      trace: sinon.stub().resolves([
        { type: "CALL", address: "0x123", depth: 0 },
        { type: "CREATE", address: "0x456", depth: 0 },
        { type: "LOG4", depth: 1 },
      ]),
    };
    const mockContractInfoResolver = {
      resolve: sinon
        .stub()
        .onFirstCall()
        .resolves({ res: { name: "MockContractCall", abi: [], implementation: "0x321" } })
        .onSecondCall()
        .resolves({ res: { name: "ImplementationContractCall", abi: [] } })
        .onThirdCall()
        .resolves({ res: { name: "MockContractCreate", abi: [], implementation: "0x654" } })
        .onCall(3)
        .resolves({ res: { name: "ImplementationContractCreate", abi: [] } }),
    };
    const mockReceipt = { from: "0x456" } as ContractTransactionReceipt;
    const tracer = new TxTracer(mockTraceStrategy, mockContractInfoResolver as any);

    const result = await tracer.trace(mockReceipt);

    assert.equal(result["contracts"]["0x321"].name, "ImplementationContractCall");
    assert.equal(result["contracts"]["0x654"].name, "ImplementationContractCreate");
    assert.lengthOf(result["calls"], 3);
    assert.equal(result["calls"][0].address, "0x123");
    assert.equal(result["calls"][1].address, "0x456");
    assert.equal(result["calls"][2].address, "0x123");
  });

  it("traces transaction and resolves contracts without implementation addresses", async () => {
    const mockTraceStrategy = {
      trace: sinon.stub().resolves([{ type: "CALL", address: "0x123", depth: 0 }]),
    };
    const mockContractInfoResolver = {
      resolve: sinon
        .stub()
        .onFirstCall()
        .resolves({ res: { name: "MockContract", abi: [] } }),
    };
    const mockReceipt = { from: "0x456" } as ContractTransactionReceipt;
    const tracer = new TxTracer(mockTraceStrategy, mockContractInfoResolver as any);

    const result = await tracer.trace(mockReceipt);

    assert.equal(result["contracts"]["0x123"].name, "MockContract");
  });

  it("traces transaction without resolving contracts if no resolver provided", async () => {
    const mockTraceStrategy = {
      trace: sinon.stub().resolves([{ type: "CALL", address: "0x123", depth: 0 }]),
    };
    const mockReceipt = { from: "0x456" } as ContractTransactionReceipt;
    const tracer = new TxTracer(mockTraceStrategy, null);

    const result = await tracer.trace(mockReceipt);

    assert.deepEqual(result["contracts"], {});
  });
});
