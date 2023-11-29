import { ContractTransactionReceipt, JsonRpcProvider } from "ethers";
import { StructLogTracer } from "./call-trace-stream-parser";
import bytes, { HexStr, HexStrPrefixed } from "../common/bytes";
import {
  TxCallTraceItem,
  TxCallTraceBaseItem,
  TxCallTraceCallItem,
  TxCallTraceCallType,
  TxCallTraceCreate2Item,
  TxCallTraceCreateItem,
  TxCallTraceSelfDestructItem,
  TxCallTraceType,
  TxCallTraceUnknownItem,
} from "./tx-call-trace";

type OpCode = (typeof CALL_TRACE_OPCODES)[number];

export interface TraceStrategy {
  trace(receipt: ContractTransactionReceipt): Promise<TxCallTraceItem[]>;
}

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

interface EVMMemoryReader {
  read(offset: number, size: number): HexStrPrefixed;
}

interface EVMStackReader {
  peek(offset?: number): HexStrPrefixed;
}

interface FormattedStructLog<Stack = EVMStackReader, Memory = EVMMemoryReader> {
  index: number;
  depth: number;
  error?: string;
  gas: number;
  gasCost: number;
  op: OpCode;
  pc: number;
  memory: Memory;
  stack: Stack;
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

export class DebugTxTraceStrategy implements TraceStrategy {
  private readonly provider: JsonRpcProvider;

  constructor(provider: JsonRpcProvider) {
    this.provider = provider;
  }

  async trace(receipt: ContractTransactionReceipt): Promise<TxCallTraceItem[]> {
    let depth = 0;
    let index = 0;
    const ctxChanges: FormattedStructLog[] = [];
    const callTraceStructLogs: FormattedStructLog[] = [];
    const tracer = new StructLogTracer({
      structLog: (log) => {
        if (log.depth !== depth) {
          depth = log.depth;
          ctxChanges.push(this.formatRawStructLog(log, index));
        }
        if (CALL_TRACE_OPCODES.includes(log.op)) {
          callTraceStructLogs.push(this.formatRawStructLog(log, index));
        }
        ++index;
      },
      error: (error) => {
        if (error) {
          throw new Error(error.message);
        }
      },
    });
    await tracer.trace(this.provider._getConnection().url, receipt.hash);

    const rootCall = await this.seedRootCall(receipt);
    const callTraceItems: TxCallTraceItem[] = [rootCall];
    const contextStack: TxCallTraceItem[] = [rootCall];

    for (const structLog of callTraceStructLogs) {
      if (structLog.op === "CREATE") {
        const createOpcode = this.seedCreateItem(structLog);
        // find the address of the created contract
        const firstOpAfterCreate = ctxChanges.find(
          (item) => item.index > structLog.index && item.depth === structLog.depth,
        );
        if (!firstOpAfterCreate) {
          // TODO: handle gracefully
          throw new Error("Invalid trace data");
        }

        createOpcode.deployedAddress = bytes.slice(firstOpAfterCreate.stack.peek(0), -20);

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
        }
      } else if (structLog.op === "SELFDESTRUCT") {
        const currentCtx = contextStack[contextStack.length - 1];
        if (!currentCtx) {
          throw new Error("Context is empty");
        }
        const item = this.seedSelfDestructItem(structLog);
        if (currentCtx.type === "CREATE") {
          item.contract = currentCtx.deployedAddress;
        } else if (
          currentCtx.type === "CALL" ||
          currentCtx.type === "STATICCALL" ||
          currentCtx.type === "DELEGATECALL"
        ) {
          item.contract = currentCtx.to;
        }
        callTraceItems.push(item);
      } else {
        callTraceItems.push(this.seedUnknownItem(structLog));
      }
    }
    return callTraceItems;
  }

  private parseGenericCallOpcode(
    type: TxCallTraceCallType,
    structLog: FormattedStructLog,
  ): TxCallTraceCallItem {
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

  private async seedRootCall(receipt: ContractTransactionReceipt): Promise<TxCallTraceCallItem> {
    const { gasLimit, data, value, to } = await receipt.getTransaction();

    if (!to) {
      throw new Error(`The "to" property of the transaction is null`);
    }

    return {
      type: "CALL",
      depth: 0,
      gas: Number(gasLimit),
      gasUsed: Number(receipt.gasUsed),
      input: bytes.normalize(data),
      value: value,
      to: bytes.normalize(to),
      output: "",
    };
  }

  private seedCallOpcode(structLog: FormattedStructLog): TxCallTraceCallItem {
    return this.parseGenericCallOpcode("CALL", structLog);
  }

  private seedDelegateCallOpcode(structLog: FormattedStructLog): TxCallTraceCallItem {
    return this.parseGenericCallOpcode("DELEGATECALL", structLog);
  }

  private seedStaticCallOpcode(structLog: FormattedStructLog): TxCallTraceCallItem {
    return this.parseGenericCallOpcode("STATICCALL", structLog);
  }

  private seedBaseCallItem<T extends TxCallTraceType>(
    type: T,
    structLog: FormattedStructLog,
  ): TxCallTraceBaseItem<T> {
    return {
      type,
      depth: structLog.depth,
      gas: structLog.gas,
      gasUsed: -1,
      value: 0n,
    };
  }

  private seedCreateItem(structLog: FormattedStructLog): TxCallTraceCreateItem {
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

  private seedCreate2Item(structLog: FormattedStructLog): TxCallTraceCreate2Item {
    return { ...this.seedCreateItem(structLog), type: "CREATE2", salt: structLog.stack.peek(3) };
  }

  private seedSelfDestructItem(structLog: FormattedStructLog): TxCallTraceSelfDestructItem {
    return {
      ...this.seedBaseCallItem("SELFDESTRUCT", structLog),
      contract: "",
      beneficiary: bytes.slice(structLog.stack.peek(0), -20),
    };
  }

  private seedUnknownItem(structLog: FormattedStructLog): TxCallTraceUnknownItem {
    return {
      ...this.seedBaseCallItem("UNKNOWN", structLog),
      output: "",
    };
  }

  private formatRawStructLog(structLog: RawStructLog, index: number): FormattedStructLog {
    return {
      index: index,
      depth: structLog.depth,
      gas: structLog.gas,
      gasCost: structLog.gasCost,
      op: structLog.op,
      pc: structLog.pc,
      error: structLog.error || undefined,
      stack: new ReadOnlyEVMStack(structLog.stack || []),
      memory: new ReadOnlyEVMMemory(structLog.memory || []),
    };
  }
}

class ReadOnlyEVMMemory {
  private readonly memory: string;

  constructor(memory: string[]) {
    this.memory = memory.join("");
  }

  read(offset: number, size: number): HexStrPrefixed {
    return bytes.normalize(this.memory.slice(2 * offset, 2 * (offset + size)));
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

  peek(offset: number = 0): HexStrPrefixed {
    if (offset >= this.stack.length) {
      throw new Error(`offset: ${offset} exceeds the stack size: ${this.stack.length}`);
    }
    const item = this.stack[this.stack.length - 1 - offset];
    if (item === undefined) {
      throw new Error(`Stack item is undefined`);
    }
    return bytes.normalize(item);
  }
}
