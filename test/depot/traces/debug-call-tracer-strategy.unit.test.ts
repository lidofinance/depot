import sinon from "sinon";
import { assert } from "@/src/common/assert";
import { RpcClient } from "@/src/network";
import { DebugCallTracerStrategy } from "@/src/traces/debug-call-tracer-strategy";

const PARENT = "0x1111111111111111111111111111111111111111";
const CHILD = "0x2222222222222222222222222222222222222222";

function callFrame(to: string, extra: Record<string, unknown> = {}) {
  return { type: "CALL", from: PARENT, to, gas: "0x0", gasUsed: "0x0", input: "0x", ...extra };
}

function logEntry(data: string, position: string) {
  return { address: PARENT, topics: [], data, position };
}

describe("DebugCallTracerStrategy", () => {
  it("emits all logs preceding a nested call before the call itself", async () => {
    const client = sinon.createStubInstance(RpcClient);
    client.send.resolves(
      callFrame(PARENT, {
        logs: [logEntry("0x01", "0x0"), logEntry("0x02", "0x0"), logEntry("0x03", "0x1")],
        calls: [callFrame(CHILD)],
      }),
    );

    const items = await new DebugCallTracerStrategy(client).trace("0x1234");

    assert.deepEqual(
      items.map((item) => ("data" in item ? `LOG:${item.data}` : `${item.type}:${item.address}`)),
      [`CALL:${PARENT}`, "LOG:0x01", "LOG:0x02", `CALL:${CHILD}`, "LOG:0x03"],
    );
  });
});
