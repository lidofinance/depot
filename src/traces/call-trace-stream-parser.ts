import fetch from "node-fetch";
import clarinet from "clarinet";
import { HexStr } from "../common/bytes";
import { JsonBuilder } from "./json-builder";

const CALL_TRACE_OPCODES = [
  "CREATE",
  "CREATE2",
  "CALL",
  "CALLCODE",
  "STATICCALL",
  "DELEGATECALL",
  "RETURN",
  "REVERT",
  "INVALID",
  "SELFDESTRUCT",
  "STOP",
] as const;

interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

interface StructLogTracerHandlers {
  gas?(gas: number): void;
  error?(error: JsonRpcError): void;
  structLog?(structLog: RawStructLog): void;
  returnValue?(returnValue: string): void;
}

export class StructLogTracer {
  constructor(private readonly handlers: StructLogTracerHandlers) {}

  async trace(url: string, hash: string) {
    const response = await this.requestTrace(url, hash);

    const cparser = clarinet.parser();
    const jsonBuilder = new JsonBuilder();
    let obj: any = null;

    cparser.onopenobject = (key?: string) => {
      jsonBuilder.openObject();
      if (key !== undefined) {
        jsonBuilder.key(key);
      }
    };

    cparser.oncloseobject = () => {
      jsonBuilder.closeObject();

      obj = jsonBuilder.pop();

      if (this.handlers?.structLog && this.isStructLog(obj)) {
        this.handlers.structLog(obj);
      }
    };

    cparser.onopenarray = () => jsonBuilder.openArray();
    cparser.onclosearray = () => jsonBuilder.closeArray();
    cparser.onkey = (key: string) => jsonBuilder.key(key);
    cparser.onvalue = (value: string | boolean | null) => jsonBuilder.value(value);

    if (!response.body) {
      throw new Error(`The response body is null ${response}`);
    }

    for await (const chunk of response.body) {
      cparser.write(chunk.toString());
    }
    const { result, error } = obj;

    if (result) {
      this.handlers.gas?.(result.gas);
      this.handlers.returnValue?.(result.returnValue);
    }

    if (error) {
      this.handlers.error?.(error);
    }
    cparser.close();
  }

  private isStructLog(log: unknown): log is RawStructLog {
    const asRawLog = log as RawStructLog;
    return (
      asRawLog &&
      asRawLog.op !== undefined &&
      asRawLog.depth !== undefined &&
      asRawLog.pc !== undefined &&
      asRawLog.gas !== undefined
    );
  }

  private async requestTrace(url: string, hash: string) {
    // TODO: handle failed requests, for example when tx wasn't found
    return fetch(url, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "debug_traceTransaction",
        params: [hash, { disableStack: false, disableMemory: false, disableStorage: true }],
      }),
    });
  }
}

type OpCode = (typeof CALL_TRACE_OPCODES)[number];

interface RawStructLog {
  pc: number;
  gas: number;
  op: OpCode;
  depth: number;
  gasCost: number;

  error: HexStr | null | undefined;
  memory: HexStr[] | null | undefined;
  stack: HexStr[] | null | undefined;
}
