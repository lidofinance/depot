import fetch from "node-fetch";
import clarinet from "clarinet";
import { JsonBuilder } from "./json-builder";
import { RawStructLog } from "./types";
import { RpcClient } from "../network";
import { Readable } from "stream";

interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

interface DebugStructLogResponse {
  failed: boolean;
  gas: number;
  returnValue: string;
  structLogs: RawStructLog[];
}

interface StructLogTracerHandlers {
  gas?(gas: number): void;
  error?(error: JsonRpcError): void;
  structLog?(structLog: RawStructLog): void;
  returnValue?(returnValue: string): void;
}

export interface TraceParameters {
  disableStack?: boolean | null;
  disableStorage?: boolean | null;
  enableMemory?: boolean | null;
  enableReturnData?: boolean | null;
}

const DEFAULT_PARAMS: TraceParameters = {
  enableMemory: false,
  disableStack: false,
  disableStorage: false,
  enableReturnData: false,
};

export class DebugTraceTxStreamed {
  private requestId: number = 1;
  public params: TraceParameters;

  constructor(
    private readonly client: RpcClient,
    private readonly handlers: StructLogTracerHandlers,
    params?: TraceParameters,
  ) {
    this.params = params ?? { ...DEFAULT_PARAMS };
  }

  async trace(hash: string, params?: TraceParameters) {
    const readable = await this.requestTrace(hash, params ?? this.params);

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

    if (!readable) {
      throw new Error(`The response body is null ${readable}`);
    }

    for await (const chunk of readable) {
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

  private mapTraceParameters(rpcName: string, params: TraceParameters) {
    if (rpcName === "hardhat" || rpcName === "erigon") {
      return {
        disableStack: params.disableStack ?? false,
        disableStorage: params.disableStorage ?? false,
        disableMemory: params.enableMemory === true ? false : true, // disabled by default
        disableReturnData: params.enableReturnData === true ? false : true, // disabled by default
      };
    }
    return {
      disableStack: params.disableStack ?? false,
      disableStorage: params.disableStorage ?? false,
      enableMemory: params.enableMemory ?? false,
      enableReturnData: params.enableReturnData ?? false,
    };
  }

  private async requestTrace(hash: string, params: TraceParameters) {
    const nodeInfo = await this.client.getNodeInfo();
    const reqParams = [hash, this.mapTraceParameters(nodeInfo.name, params)];
    const rpcUrl = this.client.getRpcUrl();

    if (rpcUrl) {
      // TODO: handle failed requests, for example when tx wasn't found
      return fetch(rpcUrl, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: this.requestId++,
          jsonrpc: "2.0",
          method: "debug_traceTransaction",
          params: reqParams,
        }),
      }).then((res) => res.body);
    }

    // If used default hardhat provider and not a standalone dev RPC node, make regular call
    // Note: this call may fail if the trace is too large
    const res: DebugStructLogResponse = await this.client.send("debug_traceTransaction", reqParams);

    return Readable.from(this.#streamifyResponse(res));
  }

  *#streamifyResponse(response: DebugStructLogResponse) {
    if (response.failed) {
      yield JSON.stringify(response);
      return;
    }
    // As the result of the tracing may be very huge, stream it by chunks
    yield `{"failed":false,"gas":${response.gas},"returnValue":"${response.returnValue}","structLogs":[`;

    for (let i = 0; i < response.structLogs.length; i++) {
      yield JSON.stringify(response.structLogs[i]);
      if (i < response.structLogs.length - 1) yield ",";
    }

    yield "]}";
  }
}
