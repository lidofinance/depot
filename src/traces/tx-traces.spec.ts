import { NamedContract } from "../contracts";
import sinon from "sinon";
import { TxTrace, TxTraceCallItem, TxTraceItem, TxTraceLogItem } from "./tx-traces";
import { Network } from "ethers";
import { assert } from "../common/assert";

describe("Transaction traces", function () {
  describe("parseMethodCall", function () {
    it("parses method call with valid calldata and return data", () => {
      const mockContract = {
        name: "MockContract",
        getFunction: sinon.stub().returns({ fragment: { name: "mockMethod", inputs: [] } }),
        interface: {
          decodeFunctionData: sinon.stub().returns(["arg1", "arg2"]),
          decodeFunctionResult: sinon.stub().returns("result"),
        },
      } as unknown as NamedContract;
      const calldata = "0xmockcalldata";
      const ret = "0xmockret";
      const txTrace = new TxTrace({} as Network, "0x456", [], {});

      const result = txTrace["parseMethodCall"](mockContract, calldata, ret);

      assert.equal(result.fragment.name, "mockMethod");
      assert.deepEqual(result.args, ["arg1", "arg2"] as any);
      assert.equal(result.result, "result" as any);
    });

    it("throws error when contract function is not found", () => {
      const mockContract = {
        name: "MockContract",
        getFunction: sinon.stub().throws(new Error("Function not found")),
        interface: {
          decodeFunctionData: sinon.stub(),
          decodeFunctionResult: sinon.stub(),
        },
      } as unknown as NamedContract;
      const calldata = "0xinvalidcalldata";
      const ret = "0xmockret";
      const txTrace = new TxTrace({} as Network, "0x456", [], {});

      assert.throws(() => txTrace["parseMethodCall"](mockContract, calldata, ret), "Function not found");
    });
  });

  describe("updateDepths", () => {
    it("updates depths correctly for a single call", () => {
      const calls = [{ depth: 0 }] as TxTraceItem[];
      const txTrace = new TxTrace({} as Network, "0x456", calls, {});

      txTrace["updateDepths"](calls);

      assert.deepEqual(
        calls.map((call) => call.depth),
        [0],
      );
    });

    it("updates depths correctly for nested calls", () => {
      const calls = [{ depth: 0 }, { depth: 1 }, { depth: 2 }, { depth: 1 }, { depth: 0 }] as TxTraceItem[];
      const txTrace = new TxTrace({} as Network, "0x456", calls, {});

      txTrace["updateDepths"](calls);

      assert.deepEqual(
        calls.map((call) => call.depth),
        [0, 1, 2, 3, 3],
      );
    });

    it("updates depths correctly for calls with same depth", () => {
      const calls = [{ depth: 0 }, { depth: 0 }, { depth: 1 }, { depth: 1 }] as TxTraceItem[];
      const txTrace = new TxTrace({} as Network, "0x456", calls, {});

      txTrace["updateDepths"](calls);

      assert.deepEqual(
        calls.map((call) => call.depth),
        [0, 0, 1, 2],
      );
    });

    it("updates depths correctly for calls with varying depths", () => {
      const calls = [{ depth: 0 }, { depth: 2 }, { depth: 1 }, { depth: 3 }, { depth: 2 }] as TxTraceItem[];
      const txTrace = new TxTrace({} as Network, "0x456", calls, {});

      txTrace["updateDepths"](calls);

      assert.deepEqual(
        calls.map((call) => call.depth),
        [0, 1, 2, 3, 4],
      );
    });

    it("handles empty calls array", () => {
      const calls = [] as TxTraceItem[];
      const txTrace = new TxTrace({} as Network, "0x456", calls, {});

      txTrace["updateDepths"](calls);

      assert.deepEqual(
        calls.map((call) => call.depth),
        [],
      );
    });
  });

  describe("formatCallTraceItem", () => {
    it("formats call trace item with valid contract and method call", () => {
      const mockContract = {
        name: "MockContract",
        getFunction: sinon
          .stub()
          .returns({ fragment: { name: "mockMethod", inputs: [{ name: "param1" }, { name: "param2" }] } }),
        interface: {
          decodeFunctionData: sinon.stub().returns(["arg1", "arg2"]),
          decodeFunctionResult: sinon.stub().returns("result"),
        },
      } as unknown as NamedContract;
      const traceCallItem = {
        type: "CALL",
        depth: 0,
        address: "0x123",
        input: "0xmockinput",
        output: "0xmockoutput",
      } as unknown as TxTraceCallItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceCallItem], { "0x123": mockContract });

      const result = txTrace["formatCallTraceItem"](traceCallItem);

      assert.equal(
        result,
        "[1m[32mCALL[39m[22m MockContract.[34m[3mmockMethod[23m[39m[34m[3m([23m[39m\n" +
          "[34m[3m[23m[39m  [33mparam1[39m=arg1,\n" +
          "  [33mparam2[39m=arg2[34m[3m[23m[39m\n" +
          "[34m[3m)[23m[39m => result",
      );
    });

    it("formats call trace item with unknown contract", () => {
      const traceCallItem = {
        type: "CALL",
        depth: 0,
        address: "0xunknown",
        input: "0xmockinput",
        output: "0xmockoutput",
      } as unknown as TxTraceCallItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceCallItem], {});

      const result = txTrace["formatCallTraceItem"](traceCallItem);

      assert.equal(
        result,
        "[1m[32mCALL[39m[22m [35m[1mUNKNOWN[22m[39m[35m[1m[[22m[39m[36m[4m[3m0xunknown[23m[24m[39m[35m[1m][22m[39m.[34m[3m0xmockinpu[23m[39m[34m[3m([23m[39m\n" +
          "[34m[3m[23m[39m  [33mdata[39m=0xt[34m[3m[23m[39m\n" +
          "[34m[3m)[23m[39m => 0xmockoutput",
      );
    });

    it("formats call trace item with padding", () => {
      const mockContract = {
        name: "MockContract",
        getFunction: sinon.stub().returns({ fragment: { name: "mockMethod", inputs: [] } }),
        interface: {
          decodeFunctionData: sinon.stub().returns(["arg1"]),
          decodeFunctionResult: sinon.stub().returns("result"),
        },
      } as unknown as NamedContract;
      const traceCallItem = {
        type: "CALL",
        depth: 1,
        address: "0x123",
        input: "0xmockinput",
        output: "0xmockoutput",
      } as unknown as TxTraceCallItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceCallItem], { "0x123": mockContract });

      const result = txTrace["formatCallTraceItem"](traceCallItem, 2);

      assert.equal(
        result,
        "      [1m[32mCALL[39m[22m MockContract.[34m[3mmockMethod[23m[39m[34m[3m([23m[39m\n" +
          "[34m[3m[23m[39m        [33mdata[39m=0xt[34m[3m[23m[39m\n" +
          "[34m[3m      )[23m[39m => result",
      );
    });
  });

  describe("formatLogTraceItem", () => {
    it("formats log trace item with valid contract and log data", () => {
      const mockContract = {
        name: "MockContract",
        interface: {
          parseLog: sinon.stub().returns({
            name: "MockLog",
            args: ["value1", "value2"],
            fragment: { inputs: [{ name: "input0" }, { name: "input1" }] },
          }),
        },
      } as unknown as NamedContract;
      const traceLogItem = {
        type: "LOG4",
        depth: 0,
        address: "0x123",
        data: "0xmockdata",
      } as TxTraceLogItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceLogItem], { "0x123": mockContract });

      const result = txTrace["formatLogTraceItem"](traceLogItem);

      assert.equal(
        result,
        "[1m[32mLOG[39m[22m MockContract.[35m[1mMockLog[22m[39m(\n" +
          "  [33minput0[39m=value1,\n" +
          "  [33minput1[39m=value2\n" +
          ")",
      );
    });

    it("formats log trace item with unknown contract", () => {
      const traceLogItem = {
        type: "LOG4",
        depth: 0,
        address: "0xunknown",
        data: "0xmockdata",
      } as TxTraceLogItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceLogItem], {});

      const result = txTrace["formatLogTraceItem"](traceLogItem);

      assert.equal(result, "LOG4");
    });

    it("formats log trace item with padding", () => {
      const mockContract = {
        name: "MockContract",
        interface: {
          parseLog: sinon.stub().returns({
            name: "MockLog",
            args: ["value1", "value2"],
            fragment: { inputs: [{ name: "input0" }, { name: "input1" }] },
          }),
        },
      } as unknown as NamedContract;
      const traceLogItem = {
        type: "LOG4",
        depth: 1,
        address: "0x123",
        data: "0xmockdata",
      } as TxTraceLogItem;
      const txTrace = new TxTrace({} as Network, "0x456", [traceLogItem], { "0x123": mockContract });

      const result = txTrace["formatLogTraceItem"](traceLogItem, 2);

      assert.equal(
        result,
        "      [1m[32mLOG[39m[22m MockContract.[35m[1mMockLog[22m[39m(\n" +
          "        [33minput0[39m=value1,\n" +
          "        [33minput1[39m=value2\n" +
          "      )",
      );
    });
  });
});
