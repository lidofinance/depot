import { JsonRpcProvider, TransactionResponse } from "ethers";
import { ContractsResolver } from "../../contracts";
import { StaticProvider } from "../static-provider";

import bytes, { BytesStringNonPrefixed, BytesStringPrefixed } from "../../common/bytes";
import {
  CallTraceBaseItem,
  CallTraceCallItem,
  CallTraceCallType,
  CallTraceCreate2Item,
  CallTraceCreateItem,
  CallTraceType,
  CallTraceUnknownItem,
  TxCallTraceItem,
} from "./transaction-call-trace";

interface TraceTransactionOptions {
  disableStack: boolean;
  disableMemory: boolean;
  disableStorage: boolean;
}

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

type OpCode = (typeof CALL_TRACE_OPCODES)[number];

interface RawTraceTransactionResult {
  gas: BytesStringPrefixed;
  structLogs: RawStructLog[];
  returnValue: string;
}

interface RawStructLog {
  depth: number;
  error: BytesStringNonPrefixed | null; // empty string if no error
  gas: BytesStringPrefixed; // hex encoded number
  gasCost: number;
  op: OpCode;
  pc: number;
  memory: BytesStringNonPrefixed[] | null;
  stack: BytesStringNonPrefixed[] | null;
  storage: Record<BytesStringNonPrefixed, BytesStringNonPrefixed> | null;
}

interface EVMMemoryReader {
  read(offset: number, size: number): BytesStringPrefixed;
}

interface EVMStackReader {
  peek(offset?: number): BytesStringPrefixed;
}

interface FormattedStructLog<Stack = EVMStackReader, Memory = EVMMemoryReader> {
  depth: number;
  error?: string;
  gas: number;
  gasCost: number;
  op: OpCode;
  pc: number;
  memory: Memory;
  stack: Stack;
}

class ReadOnlyEVMMemory {
  private readonly memory: string;

  constructor(memory: string[]) {
    this.memory = memory.join("");
  }

  read(offset: number, size: number): string {
    return "0x" + this.memory.slice(2 * offset, 2 * (offset + size));
  }
}

class ReadOnlyEVMStack {
  private readonly stack: string[];

  constructor(stack: string[]) {
    this.stack = stack;
  }

  get size(): number {
    return this.stack.length;
  }

  peek(offset: number = 0): string {
    if (offset >= this.stack.length) {
      throw new Error(`offset: ${offset} exceeds the stack size: ${this.stack.length}`);
    }
    return "0x" + this.stack[this.stack.length - 1 - offset];
  }
}

export class DebugTxTracer<P extends StaticProvider<JsonRpcProvider>> {
  private readonly provider: P;
  public isTracingEnabled: boolean = false;
  private readonly contractsResolver: ContractsResolver;

  constructor(provider: P, contractsResolver: ContractsResolver) {
    this.provider = provider;
    this.contractsResolver = contractsResolver;
  }

  async enableTracing() {
    this.isTracingEnabled = true;
  }

  async disableTracing() {
    this.isTracingEnabled = false;
  }

  public async getTrace(hash: string) {
    const txResponse = await this.provider.getTransaction(hash);
    if (!txResponse) return undefined;
    const rawTxTrace = await this.traceTransaction(hash, {
      disableStorage: true,
      disableMemory: false,
      disableStack: false,
    });

    const callTraceStructLogs = rawTxTrace.structLogs
      .filter((log) => CALL_TRACE_OPCODES.includes(log.op))
      .map((log) => this.formatRawStructLog(log));

    const callTraceItems: TxCallTraceItem[] = [await this.seedRootCall(txResponse)];
    const contextStack: TxCallTraceItem[] = [...callTraceItems];

    for (const structLog of callTraceStructLogs) {
      if (structLog.op === "CREATE") {
        const createOpcode = this.seedCreateItem(structLog);
        contextStack.push(createOpcode);
        callTraceItems.push(createOpcode);
      } else if (structLog.op === "CREATE2") {
        const create2Opcode = await this.seedCreate2Item(structLog);
        contextStack.push(create2Opcode);
        callTraceItems.push(create2Opcode);
      } else if (structLog.op === "CALL") {
        const callOpCode = this.seedCallOpcode(structLog);
        contextStack.push(callOpCode);
        callTraceItems.push(callOpCode);
      } else if (structLog.op === "DELEGATECALL") {
        const delegateCallOpCode = await this.seedDelegateCallOpcode(structLog);
        contextStack.push(delegateCallOpCode);
        callTraceItems.push(delegateCallOpCode);
      } else if (structLog.op === "STATICCALL") {
        const staticCallOpCode = await this.seedStaticCallOpcode(structLog);
        contextStack.push(staticCallOpCode);
        callTraceItems.push(staticCallOpCode);
      } else if (structLog.op === "STOP") {
        const currentContext = contextStack.pop();
        if (!currentContext) {
          throw new Error("Context stack is empty");
        }
        if (
          currentContext.type === "CALL" ||
          currentContext.type === "DELEGATECALL" ||
          currentContext.type === "STATICCALL" ||
          currentContext.type === "UNKNOWN"
        ) {
          currentContext.output = "0x";
        } else if (currentContext.type === "CREATE" || currentContext.type === "CREATE2") {
          currentContext.deployedAddress = "0x";
        }
      } else if (structLog.op === "RETURN") {
        const currentContext = contextStack.pop();
        if (!currentContext) {
          throw new Error("Context stack is empty");
        }
        switch (currentContext.type) {
          case "CALL":
          case "DELEGATECALL":
          case "STATICCALL":
          case "UNKNOWN":
            currentContext.output = structLog.memory.read(
              bytes.toInt(structLog.stack.peek(0)),
              bytes.toInt(structLog.stack.peek(1)),
            );
            break;
          case "CREATE":
          case "CREATE2":
            currentContext.deployedAddress = bytes.slice(
              structLog.memory.read(
                bytes.toInt(structLog.stack.peek(0)),
                bytes.toInt(structLog.stack.peek(1)),
              ),
              -20,
            );
        }
      } else {
        callTraceItems.push(this.seedUnknownItem(structLog));
      }
    }
  }

  private parseGenericCallOpcode<T extends CallTraceCallType>(
    type: T,
    structLog: FormattedStructLog,
  ): CallTraceCallItem<T> {
    const value = type === "CALL" ? bytes.toBigInt(structLog.stack.peek(2)) : 0n;
    const calldataStackIndices = type === "CALL" ? [3, 4] : [2, 3];

    return {
      type: type,
      gas: structLog.gas,
      depth: structLog.depth,
      input: structLog.memory.read(
        bytes.toInt(structLog.stack.peek(calldataStackIndices[0])),
        bytes.toInt(structLog.stack.peek(calldataStackIndices[1])),
      ),
      to: bytes.slice(structLog.stack.peek(1), -20),
      value,
      gasUsed: -1,
      error: structLog.error,
      output: "",
    };
  }

  private seedCallOpcode(structLog: FormattedStructLog): CallTraceCallItem {
    return this.parseGenericCallOpcode("CALL", structLog);
  }

  private seedDelegateCallOpcode(structLog: FormattedStructLog): CallTraceCallItem {
    return this.parseGenericCallOpcode("DELEGATECALL", structLog);
  }

  private seedStaticCallOpcode(structLog: FormattedStructLog): CallTraceCallItem {
    return this.parseGenericCallOpcode("STATICCALL", structLog);
  }

  private seedBaseCallItem<T extends CallTraceType>(
    type: T,
    structLog: FormattedStructLog,
  ): CallTraceBaseItem<T> {
    return {
      type,
      depth: structLog.depth,
      gas: structLog.gas,
      gasUsed: -1,
      value: 0n,
    };
  }

  private seedCreateItem(structLog: FormattedStructLog): CallTraceCreateItem {
    return {
      ...this.seedBaseCallItem("CREATE", structLog),
      initCode: structLog.memory.read(
        bytes.toInt(structLog.stack.peek(1)),
        bytes.toInt(structLog.stack.peek(2)),
      ),
      value: bytes.toBigInt(structLog.stack.peek(0)),
      deployedAddress: "",
    };
  }

  private seedCreate2Item(structLog: FormattedStructLog): CallTraceCreate2Item {
    return { ...this.seedCreateItem(structLog), type: "CREATE2", salt: structLog.stack.peek(3) };
  }

  private async seedRootCall(txResponse: TransactionResponse): Promise<TxCallTraceItem> {
    const receipt = await txResponse.provider.getTransactionReceipt(txResponse.hash);
    if (!receipt) {
      throw new Error(`Receipt for transaction ${txResponse.hash} not found`);
    }
    return {
      type: "CALL",
      depth: 0,
      gas: Number(txResponse.gasLimit),
      gasUsed: Number(receipt.gasUsed),
      input: txResponse.data,
      value: txResponse.value,
      to: txResponse.to || "",
      output: "",
    };
  }

  private seedUnknownItem(structLog: FormattedStructLog): CallTraceUnknownItem {
    return {
      ...this.seedBaseCallItem("UNKNOWN", structLog),
      output: "",
    };
  }

  private async traceTransaction(
    hash: string,
    options: Partial<TraceTransactionOptions> = {},
  ): Promise<RawTraceTransactionResult> {
    const { url } = this.provider._getConnection();

    const response = await fetch(url, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "debug_traceTransaction",
        params: [hash, options],
      }),
    });

    const res = await response.json();
    return res.result;
  }

  private formatRawStructLog(structLog: RawStructLog): FormattedStructLog {
    return {
      depth: structLog.depth,
      gas: bytes.toInt(structLog.gas),
      gasCost: structLog.gasCost,
      op: structLog.op,
      pc: structLog.pc,
      error: structLog.error || undefined,
      stack: new ReadOnlyEVMStack(structLog.stack || []),
      memory: new ReadOnlyEVMMemory(structLog.memory || []),
    };
  }
}
