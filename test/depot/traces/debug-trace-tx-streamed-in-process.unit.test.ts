import sinon from "sinon";
import { assert } from "@/src/common/assert";
import { RpcClient } from "@/src/network";
import { DebugTraceTxStreamed } from "@/src/traces/debug-trace-tx-streamed";
import { RawStructLog } from "@/src/traces/types";

describe("DebugTraceTxStreamed with the in-process provider", () => {
  it("parses the bare provider result without a JSON-RPC envelope", async () => {
    const structLog: RawStructLog = {
      pc: 0,
      op: "STOP",
      gas: 21000,
      gasCost: 0,
      depth: 1,
      error: null,
      memory: [],
      stack: [],
    };
    const client = sinon.createStubInstance(RpcClient);
    client.getRpcUrl.returns("");
    client.getNodeInfo.resolves({ name: "hardhat", version: "3.0.0" });
    client.send.resolves({ failed: false, gas: 21000, returnValue: "", structLogs: [structLog] });

    const structLogs: RawStructLog[] = [];
    let traceGas = -1;
    const errors: unknown[] = [];
    const tracer = new DebugTraceTxStreamed(client, {
      structLog: (log) => structLogs.push(log),
      gas: (gas) => {
        traceGas = gas;
      },
      error: (error) => errors.push(error),
    });

    await tracer.trace("0x1234");

    assert.deepEqual(structLogs, [structLog]);
    assert.equal(traceGas, 21000);
    assert.isEmpty(errors);
  });
});
