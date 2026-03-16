import sinon from "sinon";
import { assert } from "../common/assert";
import { TxTracer } from "./tx-tracer";
import * as contracts from "../contracts/contracts";

describe("TxTracer", () => {
  const addr1 = "0x1111111111111111111111111111111111111111";
  const addr2 = "0x2222222222222222222222222222222222222222";

  afterEach(() => {
    sinon.restore();
  });

  it("traces tx and resolves unique addresses from calls/creates/logs", async () => {
    const traceStrategy = {
      trace: sinon.stub().resolves([
        { type: "CALL", address: addr1, depth: 0, input: "0x", output: "0x", success: true },
        { type: "CREATE", address: addr2, depth: 1, input: "0x", output: "0x", success: true },
        { type: "LOG4", address: addr1, depth: 1, data: "0x", topics: ["0x0", "0x0", "0x0", "0x0"] },
      ]),
    };

    const resolveStub = sinon.stub(contracts, "resolveContract");
    resolveStub.withArgs("mainnet", addr1).resolves([{ address: addr1, abi: [], label: "C1" }] as any);
    resolveStub.withArgs("mainnet", addr2).resolves([{ address: addr2, abi: [], label: "C2" }] as any);

    const tracer = new TxTracer(traceStrategy as any);
    const txTrace = await tracer.trace("mainnet", "0x1234");

    assert.lengthOf(txTrace.calls, 3);
    assert.equal(txTrace.from, addr1);
    assert.equal(txTrace.contracts[addr1][0].label, "C1");
    assert.equal(txTrace.contracts[addr2][0].label, "C2");
    assert.equal(resolveStub.callCount, 2);
  });

  it("uses pre-populated contracts and skips remote resolve for them", async () => {
    const traceStrategy = {
      trace: sinon
        .stub()
        .resolves([{ type: "CALL", address: addr1, depth: 0, input: "0x", output: "0x", success: true }]),
    };
    const prePopulated = [{ address: addr1, abi: [], label: "LocalContract" }];
    const resolveStub = sinon.stub(contracts, "resolveContract");

    const tracer = new TxTracer(traceStrategy as any);
    const txTrace = await tracer.trace("mainnet", "0x1234", prePopulated as any);

    assert.equal(resolveStub.callCount, 0);
    assert.equal(txTrace.contracts[addr1][0].label, "LocalContract");
    assert.deepEqual(txTrace.prePopulatedContracts, prePopulated as any);
  });

  it("normalizes addresses and avoids duplicate resolves", async () => {
    const upper = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const lower = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const traceStrategy = {
      trace: sinon.stub().resolves([
        { type: "CALL", address: upper, depth: 0, input: "0x", output: "0x", success: true },
        { type: "LOG4", address: lower, depth: 1, data: "0x", topics: ["0x0", "0x0", "0x0", "0x0"] },
      ]),
    };

    const resolveStub = sinon
      .stub(contracts, "resolveContract")
      .resolves([{ address: lower, abi: [], label: "C" }] as any);

    const tracer = new TxTracer(traceStrategy as any);
    const txTrace = await tracer.trace("mainnet", "0x1234");

    assert.equal(resolveStub.callCount, 1);
    assert.equal(txTrace.contracts[lower][0].label, "C");
  });

  it("propagates contract resolve errors", async () => {
    const traceStrategy = {
      trace: sinon
        .stub()
        .resolves([{ type: "CALL", address: addr1, depth: 0, input: "0x", output: "0x", success: true }]),
    };
    sinon.stub(contracts, "resolveContract").rejects(new Error("Resolve error"));

    const tracer = new TxTracer(traceStrategy as any);

    await assert.isRejected(tracer.trace("mainnet", "0x1234"), "Resolve error");
  });
});
