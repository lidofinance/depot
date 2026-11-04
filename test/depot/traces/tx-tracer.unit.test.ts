import sinon from "sinon";
import { assert } from "@/src/common/assert";
import { TxTracer } from "@/src/traces/tx-tracer";
import { tracerDeps } from "@/src/traces/tx-tracer";

describe("TxTracer", () => {
  const addr1 = "0x1111111111111111111111111111111111111111";

  afterEach(() => {
    sinon.restore();
  });

  it("marks placeholder as resolve failed on unexpected error", async () => {
    const traceStrategy = {
      trace: sinon
        .stub()
        .resolves([{ type: "CALL", address: addr1, depth: 0, input: "0x", output: "0x", success: true }]),
    };
    sinon.stub(tracerDeps, "resolveContract").rejects(new Error("Network unreachable"));

    const tracer = new TxTracer(traceStrategy as any);
    const txTrace = await tracer.trace("mainnet", "0x1234");

    assert.equal(txTrace.contracts[addr1][0].label, `Contract[${addr1}] (resolve failed)`);
  });
});
