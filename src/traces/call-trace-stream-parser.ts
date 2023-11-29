import fetch from "node-fetch";
import clarinet from "clarinet";
import { HexStr } from "../common/bytes";

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
  returnValue?(handler: (returnValue: string) => void): void;
}

const TOKENS = {
  OBJECT_OPEN: "{",
  OBJECT_CLOSE: "}",
  ARRAY_OPEN: "[",
  ARRAY_CLOSE: "]",
  COLON: ":",
  COMMA: ",",
  DOUBLE_QUOTES: '"',
};

class JsonBuilder {
  private readonly tokens: string[] = [];

  private parse(tokens: string[]): object {
    return JSON.parse(tokens.join("").replace(/\n/g, "\\n"));
  }

  build(): object {
    return this.parse(this.tokens.splice(0, this.tokens.length));
  }

  pop(): object | null {
    if (this.tokens[this.tokens.length - 1] !== TOKENS.OBJECT_CLOSE) {
      // there is no built object on the top of the tokens stack
      return null;
    }
    let objectOpenIndex = this.tokens.length - 1;
    while (objectOpenIndex > 0 && this.tokens[objectOpenIndex] !== TOKENS.OBJECT_OPEN) {
      --objectOpenIndex;
    }
    if (objectOpenIndex < 0) {
      throw new Error(`Invalid JSON. Corresponding "${TOKENS.OBJECT_OPEN}" token not found`);
    }

    if (objectOpenIndex > 0 && this.tokens[objectOpenIndex - 1] === TOKENS.COLON) {
      // return null because it's part of the larger object
      return null;
    }

    return this.parse(this.tokens.splice(objectOpenIndex, this.tokens.length - objectOpenIndex));
  }

  key(key: string) {
    this.tokens.push(TOKENS.DOUBLE_QUOTES);
    this.tokens.push(key);
    this.tokens.push(TOKENS.DOUBLE_QUOTES);
    this.tokens.push(TOKENS.COLON);
  }

  value(value: string | number | boolean | null) {
    if (typeof value === "string") {
      this.tokens.push(TOKENS.DOUBLE_QUOTES);
      this.tokens.push(value);
      this.tokens.push(TOKENS.DOUBLE_QUOTES);
    } else {
      this.tokens.push("" + value); // cast to string
    }
    this.comma();
  }

  openArray() {
    this.tokens.push(TOKENS.ARRAY_OPEN);
  }

  closeArray() {
    this.stripTrailingComma();
    this.tokens.push(TOKENS.ARRAY_CLOSE);
    this.comma();
  }

  openObject() {
    this.tokens.push(TOKENS.OBJECT_OPEN);
  }

  closeObject() {
    this.stripTrailingComma();
    this.tokens.push(TOKENS.OBJECT_CLOSE);
  }

  private comma() {
    this.tokens.push(TOKENS.COMMA);
  }

  private stripTrailingComma() {
    if (this.tokens[this.tokens.length - 1] === TOKENS.COMMA) {
      this.tokens.pop();
    }
  }
}

export class StructLogTracer {
  constructor(private readonly handlers: StructLogTracerHandlers) {}

  async trace(url: string, hash: string) {
    const response = await this.requestTrace(url, hash);

    const cparser = clarinet.parser();
    const jsonBuilder = new JsonBuilder();

    cparser.onopenobject = (key?: string) => {
      jsonBuilder.openObject();
      if (key !== undefined) {
        jsonBuilder.key(key);
      }
    };

    cparser.oncloseobject = () => {
      jsonBuilder.closeObject();

      const object = jsonBuilder.pop();
      if (!object) return;

      if (this.handlers?.structLog && this.isStructLog(object)) {
        this.handlers.structLog(object);
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
    const { result, error } = jsonBuilder.build() as any;

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
