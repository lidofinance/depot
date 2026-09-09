import { assert } from "../../src/common/assert";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult } from "viem";
import { TxTrace, TxTraceCallItem, TxTraceItem } from "../../src/traces/tx-traces";
import fmt from "../../src/common/format";

const testAbi = [
  {
    type: "function",
    name: "foo",
    stateMutability: "view",
    inputs: [{ name: "x", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Ping",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
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
  it("normalizes depths on filter", () => {
    const calls: TxTraceItem[] = [
      createCallItem(contractAddress, 4),
      { ...(createCallItem(contractAddress, 5) as any), type: "LOG4", data: "0x", topics: ["0x00"] },
      createCallItem(contractAddress, 6),
    ] as any;
    const trace = new TxTrace("mainnet", contractAddress, calls, {}, []);

    const filtered = trace.filter((item) => !("data" in item));

    assert.deepEqual(
      filtered.calls.map((c) => c.depth),
      [0, 1],
    );
  });

  it("normalizes depths on slice", () => {
    const calls: TxTraceItem[] = [createCallItem(contractAddress, 7), createCallItem(contractAddress, 9)];
    const trace = new TxTrace("mainnet", contractAddress, calls, {}, []);

    const sliced = trace.slice(0, 2);

    assert.deepEqual(
      sliced.calls.map((c) => c.depth),
      [0, 1],
    );
  });

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
      filtered.calls.map((c) => c.depth),
      [0, 2, 1, 3],
    );
  });

  it("handles empty calls array in filter", () => {
    const trace = new TxTrace("mainnet", contractAddress, [], {}, []);
    const filtered = trace.filter(() => true);

    assert.lengthOf(filtered.calls, 0);
  });

  it("normalizes same-level depths after filter", () => {
    const calls: TxTraceItem[] = [
      createCallItem(contractAddress, 0),
      createCallItem(contractAddress, 0),
      createCallItem(contractAddress, 1),
      createCallItem(contractAddress, 1),
    ];
    const trace = new TxTrace("mainnet", contractAddress, calls, {}, []);
    const filtered = trace.filter(() => true);

    assert.deepEqual(
      filtered.calls.map((c) => c.depth),
      [0, 0, 1, 1],
    );
  });

  it("formats decoded function calls when ABI is known", () => {
    const trace = new TxTrace(
      "mainnet",
      contractAddress,
      [createCallItem()],
      {
        [contractAddress]: [{ address: contractAddress, abi: testAbi, label: "TestContract" }],
      } as any,
      [],
    );

    const result = trace.formatOpCode(trace.calls[0], 0);

    assert.include(result, "TestContract");
    assert.include(result, "foo(uint256)");
    assert.include(result, "123");
    assert.include(result, "456");
  });

  it("falls back to raw call formatting when ABI is unknown", () => {
    const trace = new TxTrace(
      "mainnet",
      unknownAddress,
      [createCallItem(unknownAddress)],
      { [unknownAddress]: [] } as any,
      [],
    );

    const result = trace.formatOpCode(trace.calls[0], 0);

    assert.include(result, "CALL");
    assert.include(result, "[return]");
  });

  it("formats decoded logs when ABI is known", () => {
    const topics = encodeEventTopics({
      abi: testAbi,
      eventName: "Ping",
      args: { from: contractAddress },
    }) as `0x${string}`[];
    const data = encodeAbiParameters([{ name: "value", type: "uint256" }], [777n]);
    const logItem = {
      type: "LOG4",
      depth: 0,
      address: contractAddress,
      data,
      topics,
    } as any;

    const trace = new TxTrace(
      "mainnet",
      contractAddress,
      [logItem],
      {
        [contractAddress]: [{ address: contractAddress, abi: testAbi, label: "TestContract" }],
      } as any,
      [],
    );

    const result = trace.formatOpCode(logItem, 0);

    assert.include(result, "Ping(address,uint256)");
    assert.include(result, "777");
  });

  it("falls back to raw log formatting when ABI is unknown", () => {
    const logItem = {
      type: "LOG4" as const,
      depth: 0,
      address: unknownAddress,
      data: "0x0000" as `0x${string}`,
      topics: ["0xdeadbeef"] as `0x${string}`[],
    } as any;
    const trace = new TxTrace("mainnet", unknownAddress, [logItem], { [unknownAddress]: [] } as any, []);

    const result = trace.formatOpCode(logItem, 0);

    assert.include(result, "LOG4");
    assert.include(result, "0xdeadbeef");
  });

  it("applies padding to formatted output", () => {
    const trace = new TxTrace(
      "mainnet",
      contractAddress,
      [createCallItem()],
      {
        [contractAddress]: [{ address: contractAddress, abi: testAbi, label: "TestContract" }],
      } as any,
      [],
    );

    const noPad = trace.formatOpCode(trace.calls[0], 0);
    const withPad = trace.formatOpCode(trace.calls[0], 3);

    // padded version should have more leading whitespace
    assert.isAbove(withPad.length, noPad.length);
    assert.match(withPad, /^\s{6}/); // 3 * 2-char pad
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

  it("prints the raw call signature when callType is omitted", () => {
    const result = stripAnsi(fmt.rawFuncCall({ address: unknownAddress, input: "0xdeadbeef" }));

    assert.include(result, unknownAddress);
    assert.include(result, "0xdeadbeef");
    assert.notInclude(result, "CALL");
  });
});
