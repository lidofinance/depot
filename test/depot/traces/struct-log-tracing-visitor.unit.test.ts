import { assert } from "@/src/common/assert";
import { StructLogsTracingVisitor } from "@/src/traces/struct-log-tracing-visitor";
import { TxTraceCallItem } from "@/src/traces/tx-traces";
import { RawStructLog } from "@/src/traces/types";

const ROOT_ADDRESS = "0x1111111111111111111111111111111111111111";
const EOA_ADDRESS = "0x2222222222222222222222222222222222222222";

function structLog(fields: Pick<RawStructLog, "op" | "gas" | "depth"> & Partial<RawStructLog>): RawStructLog {
  return { pc: 0, gasCost: 0, error: null, memory: [], stack: [], ...fields };
}

describe("StructLogsTracingVisitor", () => {
  it("closes the frame of a CALL to an EOA that produces no nested struct logs", () => {
    const visitor = new StructLogsTracingVisitor({ address: ROOT_ADDRESS, gasLimit: 200_000, data: "0x" });

    visitor.visit(structLog({ op: "PUSH1", gas: 100_003, depth: 1 }));
    // CALL stack bottom to top: retSize, retOffset, argsSize, argsOffset, value, address, gas
    visitor.visit(
      structLog({
        op: "CALL",
        gas: 100_000,
        depth: 1,
        stack: ["0x0", "0x0", "0x0", "0x0", "0x5", EOA_ADDRESS, "0x2710"],
      }),
    );
    visitor.visit(structLog({ op: "POP", gas: 90_000, depth: 1, stack: ["0x1"] }));
    visitor.visit(structLog({ op: "STOP", gas: 89_998, depth: 1 }));

    const items = visitor.finalize();

    assert.deepEqual(
      items.map((item) => [item.type, item.depth, item.address]),
      [
        ["CALL", 0, ROOT_ADDRESS],
        ["CALL", 1, EOA_ADDRESS],
      ],
    );
    const eoaCall = items[1] as TxTraceCallItem;
    assert.isTrue(eoaCall.success);
    assert.equal(eoaCall.value, 5n);
    assert.equal(eoaCall.gasProvided, 100_000);
    assert.equal(eoaCall.gasSpent, 10_000);
  });
});
