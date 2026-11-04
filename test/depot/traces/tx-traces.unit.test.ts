import { assert } from "@/src/common/assert";
import { encodeFunctionData, encodeFunctionResult } from "viem";
import { TxTrace, TxTraceCallItem, TxTraceItem } from "@/src/traces/tx-traces";

const testAbi = [
  {
    type: "function",
    name: "foo",
    stateMutability: "view",
    inputs: [{ name: "x", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// chalk keeps colors when the runner is attached to a TTY, so assertions compare against plain text
const ANSI_ESCAPE_PATTERN = new RegExp("\u001B\\[[0-9;]*m", "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, "");
}

const contractAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const unknownAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

function createCallItem(address = contractAddress, depth = 0): TxTraceCallItem {
  return {
    type: "CALL",
    depth,
    value: 0n,
    gasSpent: 0,
    gasProvided: 0,
    gasLimit: 0,
    address,
    success: true,
    input: encodeFunctionData({ abi: testAbi, functionName: "foo", args: [123n] }),
    output: encodeFunctionResult({ abi: testAbi, functionName: "foo", result: 456n }),
  };
}

describe("TxTrace", () => {
  it("normalizes varying depth gaps correctly", () => {
    // updateDepths collapses unused depth levels but preserves ordering
    // input depths [0, 3, 1, 5] → used levels are {0,1,3,5} → rewrite: 0→0, 1→1, 3→2, 5→3
    const calls: TxTraceItem[] = [
      createCallItem(contractAddress, 0),
      createCallItem(contractAddress, 3),
      createCallItem(contractAddress, 1),
      createCallItem(contractAddress, 5),
    ];
    const trace = new TxTrace("mainnet", contractAddress, calls, {}, []);
    const filtered = trace.filter(() => true);

    assert.deepEqual(
      filtered.calls.map((call) => call.depth),
      [0, 2, 1, 3],
    );
  });

  it("prints opcode, address and raw input when calldata cannot be decoded", () => {
    const rawInput = "0xdeadbeef" as `0x${string}`;
    const callItem: TxTraceCallItem = { ...createCallItem(unknownAddress), input: rawInput, output: "0x" };
    const trace = new TxTrace("mainnet", unknownAddress, [callItem], { [unknownAddress]: [] } as any, []);

    const result = stripAnsi(trace.formatOpCode(trace.calls[0], 0));

    assert.include(result, "CALL");
    assert.include(result, unknownAddress);
    assert.include(result, rawInput);
  });
});
