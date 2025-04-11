import { BaseContract, FunctionFragment } from "ethers";
import sinon from "sinon";
import { TxTraceItem, TxTraceLogItem } from "../traces/tx-traces";
import { MethodCallConfig, omitMethodCalls, omitProxyDelegateCalls, omitServiceLogs, omitStaticCalls } from "./trace";
import { assert } from "../common/assert";
import { describe } from "mocha";

describe("Votes trace filter", () => {
  describe("omitServiceLogs", () => {
    it("omits service logs when log name is LogScriptCall", () => {
      const mockAgent = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const mockCallsScript = {
        interface: {
          parseLog: sinon.stub().returns({ name: "LogScriptCall" }),
        },
      } as unknown as BaseContract;
      const txTraceItem = {
        type: "LOG1",
        depth: 0,
        address: "0x123",
        topic1: "0xtopic1",
        data: "0xmockdata",
      } as TxTraceLogItem;

      const result = omitServiceLogs({ agent: mockAgent, callsScript: mockCallsScript })(txTraceItem);

      assert.isFalse(result);
    });

    it("omits service logs when log name is ScriptResult", () => {
      const mockAgent = {
        interface: {
          parseLog: sinon.stub().returns({ name: "ScriptResult" }),
        },
      } as unknown as BaseContract;
      const mockCallsScript = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const txTraceItem = {
        type: "LOG2",
        depth: 0,
        address: "0x123",
        topic1: "0xtopic1",
        data: "0xmockdata",
      } as TxTraceLogItem;

      const result = omitServiceLogs({ agent: mockAgent, callsScript: mockCallsScript })(txTraceItem);

      assert.isFalse(result);
    });

    it("includes service logs when log name is not LogScriptCall or ScriptResult", () => {
      const mockAgent = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const mockCallsScript = {
        interface: {
          parseLog: sinon.stub().returns({ name: "OtherLog" }),
        },
      } as unknown as BaseContract;
      const txTraceItem = {
        type: "LOG2",
        depth: 2,
        address: "0x123",
        topic1: "0xtopic1",
        data: "0xmockdata",
      } as TxTraceLogItem;

      const result = omitServiceLogs({ agent: mockAgent, callsScript: mockCallsScript })(txTraceItem);

      assert.isTrue(result);
    });

    it("includes service logs when log address is undefined", () => {
      const mockAgent = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const mockCallsScript = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const txTraceItem = {
        type: "LOG3",
        depth: 7,
        address: undefined,
        topic1: "0xtopic1",
        data: "0xmockdata",
      } as TxTraceLogItem;

      const result = omitServiceLogs({ agent: mockAgent, callsScript: mockCallsScript })(txTraceItem);

      assert.isTrue(result);
    });

    it("includes trace calls when type is not LOG", () => {
      const mockAgent = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const mockCallsScript = {
        interface: {
          parseLog: sinon.stub().returns(null),
        },
      } as unknown as BaseContract;
      const txTraceItem = {
        type: "CALL",
        depth: 2,
        address: "0x123",
        data: "0xmockdata",
      } as unknown as TxTraceItem;

      const result = omitServiceLogs({ agent: mockAgent, callsScript: mockCallsScript })(txTraceItem);

      assert.isTrue(result);
    });
  });

  describe("omitMethodCalls", () => {
    it("includes method calls that do not match any provided call configurations", () => {
      const calls = [
        { type: "CALL", address: "0x123", fragment: { selector: "0xabcdef" } as FunctionFragment },
      ] as MethodCallConfig[];
      const txTraceItem = {
        type: "CALL",
        address: "0x456",
        input: "0xabcdef1234",
      } as unknown as TxTraceItem;

      const result = omitMethodCalls(calls)(txTraceItem);

      assert.isTrue(result);
    });

    it("omits method calls that match provided call configurations", () => {
      const calls = [
        { type: "CALL", address: "0x123", fragment: { selector: "0xabcdef12" } as FunctionFragment },
      ] as MethodCallConfig[];
      const txTraceItem = {
        type: "CALL",
        address: "0x123",
        input: "0xabcdef123456789qwerty",
      } as unknown as TxTraceItem;

      const result = omitMethodCalls(calls)(txTraceItem);

      assert.isFalse(result);
    });

    it("omits method calls when fragment is not provided in call configuration", () => {
      const calls = [{ type: "CALL", address: "0x123" }] as MethodCallConfig[];
      const txTraceItem = {
        type: "CALL",
        address: "0x123",
        input: "0xabcdef1234",
      } as unknown as TxTraceItem;

      const result = omitMethodCalls(calls)(txTraceItem);

      assert.isFalse(result);
    });

    it("includes method calls when type does not match provided call configurations", () => {
      const calls = [
        { type: "DELEGATECALL", address: "0x123", fragment: { selector: "0xabcdef" } as FunctionFragment },
      ] as MethodCallConfig[];
      const txTraceItem = {
        type: "CALL",
        address: "0x123",
        input: "0xabcdef1234",
      } as unknown as TxTraceItem;

      const result = omitMethodCalls(calls)(txTraceItem);

      assert.isTrue(result);
    });

    it("includes method calls when address does not match provided call configurations", () => {
      const calls = [
        { type: "CALL", address: "0x123", fragment: { selector: "0xabcdef" } as FunctionFragment },
      ] as MethodCallConfig[];
      const txTraceItem = {
        type: "CALL",
        address: "0x456",
        input: "0xabcdef1234",
      } as unknown as TxTraceItem;

      const result = omitMethodCalls(calls)(txTraceItem);

      assert.isTrue(result);
    });
  });

  describe("omitProxyDelegateCalls", () => {
    it("includes delegate calls when previous opcode is not CALL or STATICCALL", () => {
      const txTraceItems = [
        { type: "LOG", input: "0xinput1" } as unknown as TxTraceItem,
        { type: "DELEGATECALL", input: "0xinput2" } as unknown as TxTraceItem,
      ];

      const result = omitProxyDelegateCalls()(txTraceItems[1], 1, txTraceItems);

      assert.isTrue(result);
    });

    it("includes delegate calls when input does not match previous CALL or STATICCALL input", () => {
      const txTraceItems = [
        { type: "CALL", input: "0xinput1" } as unknown as TxTraceItem,
        { type: "DELEGATECALL", input: "0xinput2" } as unknown as TxTraceItem,
      ];

      const result = omitProxyDelegateCalls()(txTraceItems[1], 1, txTraceItems);

      assert.isTrue(result);
    });

    it("omits delegate calls when input matches previous CALL input", () => {
      const txTraceItems = [
        { type: "CALL", input: "0xinput" } as unknown as TxTraceItem,
        { type: "DELEGATECALL", input: "0xinput" } as unknown as TxTraceItem,
      ];

      const result = omitProxyDelegateCalls()(txTraceItems[1], 1, txTraceItems);

      assert.isFalse(result);
    });

    it("omits delegate calls when input matches previous STATICCALL input", () => {
      const txTraceItems = [
        { type: "STATICCALL", input: "0xinput" } as unknown as TxTraceItem,
        { type: "DELEGATECALL", input: "0xinput" } as unknown as TxTraceItem,
      ];

      const result = omitProxyDelegateCalls()(txTraceItems[1], 1, txTraceItems);

      assert.isFalse(result);
    });
  });

  describe("omitStaticCalls", () => {
    it("includes non-static calls", () => {
      const txTraceItem = { type: "CALL" } as unknown as TxTraceItem;

      const result = omitStaticCalls()(txTraceItem);

      assert.isTrue(result);
    });

    it("omits static calls", () => {
      const txTraceItem = { type: "STATICCALL" } as unknown as TxTraceItem;

      const result = omitStaticCalls()(txTraceItem);

      assert.isFalse(result);
    });
  });
});
