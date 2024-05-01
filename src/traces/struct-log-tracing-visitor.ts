import bytes, { HexStrPrefixed } from "helpers/bytes";
import {
  CallEvmOpcodes,
  CreateEvmOpcodes,
  EvmOpcode,
  LogEvmOpcodes,
  OPCODES,
  SelfDestructEvmOpcodes,
  TerminationEvmOpcodes,
  isCallOpcode,
  isCreateOpcode,
  isExitOpcode,
  isLogOpcode,
  isSelfDestructOpcode,
} from "./evm-opcodes";
import {
  TxTraceInput,
  TxTraceItem,
  TxTraceCreateItem,
  TxTraceCallItem,
  TxTraceLogItem,
  TxTraceSelfDestructItem,
  TxTraceCtxSpawningItem,
} from "./tx-traces";
import { RawStructLog } from "./types";

interface EVMMemoryReader {
  read(offset: number, size: number): HexStrPrefixed;
}

interface EVMStackReader {
  peek(offset?: number): HexStrPrefixed;
}

interface FormattedStructLog<OpCode = EvmOpcode, Stack = EVMStackReader, Memory = EVMMemoryReader> {
  depth: number;
  error?: string;
  gas: number;
  gasCost: number;
  op: OpCode;
  pc: number;
  memory: Memory;
  stack: Stack;
}

interface CtxGasInfo {
  leftBeforeCtxEnter: number;
  leftJustAfterCtxEnter: number;

  leftBeforeCtxExit: number;
  leftJustAfterCtxExit: number;
}

export class StructLogsTracingVisitor {
  // the resulting trace items
  public readonly items: TxTraceItem[] = [];

  // persist the exited context index to set the data returned as stack output
  private prevLog: RawStructLog | null = null;

  // the index of the last context index popped from the stack
  private prevStackTop: TxTraceCreateItem | TxTraceCallItem | null = null;

  // keeps the current contexts stack of the program execution
  private readonly stack: Stack<TxTraceCreateItem | TxTraceCallItem> = new Stack();

  // tracks the gas changes between context changes
  private readonly gasInfoItems: CtxGasInfo[] = [];
  private readonly gasInfoStack: Stack<CtxGasInfo> = new Stack();

  constructor(input: TxTraceInput) {
    const rootItem = this.seedRootCall(input);
    this.items.push(rootItem);
    this.stack.push(rootItem);
    this.prevStackTop = rootItem;
  }

  public visit(log: RawStructLog) {
    if (isCallOpcode(log.op)) {
      this.handleCall(log as RawStructLog<CallEvmOpcodes>);
    } else if (isCreateOpcode(log.op)) {
      this.handleCreate(log as RawStructLog<CreateEvmOpcodes>);
    } else if (isExitOpcode(log.op)) {
      this.handleExitContext(log as RawStructLog<TerminationEvmOpcodes>);
    } else if (isLogOpcode(log.op)) {
      this.handleLog(log as RawStructLog<LogEvmOpcodes>);
    } else if (isSelfDestructOpcode(log.op)) {
      this.handleSelfDestruct(log as RawStructLog<SelfDestructEvmOpcodes>);
    } else {
      this.processStackOutput(log);
    }
    this.accountGas(this.prevLog, log);
    this.prevLog = log;
  }

  public finalize() {
    if (this.stack.length > 0) {
      throw new Error("Invalid trace evaluation result. Stack must be empty");
    }
    if (!this.prevLog) {
      throw new Error("Already finalized");
    }
    if (isExitOpcode(this.prevLog.op) || isSelfDestructOpcode(this.prevLog.op)) {
      // the first opcode after exited the context
      this.gasInfoStack.peek().leftJustAfterCtxExit = Number(this.prevLog.gas);
      this.gasInfoStack.pop();
    }
    this.prevLog = null;

    const ctxChangeItems = this.items.filter(
      (item) => !isLogOpcode(item.type) && !isSelfDestructOpcode(item.type),
    ) as TxTraceCtxSpawningItem[];

    if (this.gasInfoItems.length !== ctxChangeItems.length) {
      throw new Error(
        `Lengths mismatch of gasInfoItems and traceItems: ${this.gasInfoItems.length} !== ${ctxChangeItems.length}`,
      );
    }

    for (let i = 0; i < ctxChangeItems.length; ++i) {
      const { leftBeforeCtxEnter, leftJustAfterCtxExit } = this.gasInfoItems[i];
      ctxChangeItems[i].gasProvided = leftBeforeCtxEnter;
      ctxChangeItems[i].gasSpent = leftBeforeCtxEnter - leftJustAfterCtxExit;
    }

    return this.items;
  }

  private accountGas(prevLog: RawStructLog | null, log: RawStructLog) {
    if (prevLog === null && log !== null) {
      // the first operation in the tx trace, create the root call gas report
      this.gasInfoStack.push({
        leftBeforeCtxEnter: Number(log.gas),
        leftJustAfterCtxEnter: Number(log.gas),
        leftBeforeCtxExit: 0,
        leftJustAfterCtxExit: 0,
      });
      this.gasInfoItems.push(this.gasInfoStack.peek());
      return;
    }

    if (prevLog) {
      if (isCallOpcode(prevLog.op) || isCreateOpcode(prevLog.op)) {
        // the first opcode after entered the new context
        this.gasInfoStack.peek().leftJustAfterCtxEnter = Number(log.gas);
      } else if (isExitOpcode(prevLog.op) || isSelfDestructOpcode(prevLog.op)) {
        // the first opcode after exited the context
        this.gasInfoStack.peek().leftJustAfterCtxExit = Number(log.gas);
        this.gasInfoStack.pop();
      }
    }

    if (isCallOpcode(log.op) || isCreateOpcode(log.op)) {
      // just the next opcode will be executed in the new context
      const newContextGasInfo: CtxGasInfo = {
        leftBeforeCtxEnter: Number(log.gas),
        leftJustAfterCtxEnter: 0,
        leftBeforeCtxExit: 0,
        leftJustAfterCtxExit: 0,
      };
      this.gasInfoItems.push(newContextGasInfo);
      this.gasInfoStack.push(newContextGasInfo);
    } else if (isExitOpcode(log.op) || isSelfDestructOpcode(log.op)) {
      // the next opcode will be executed in the parent context
      this.gasInfoStack.peek().leftBeforeCtxExit = Number(log.gas);
    }
  }

  private handleCall(log: RawStructLog<CallEvmOpcodes>) {
    const call = this.seedCallInstruction(this.formatRawStructLog(log));
    this.items.push(call);
    this.stack.push(call);
  }

  private handleCreate(log: RawStructLog<CreateEvmOpcodes>) {
    const create = this.seedCreateItem(this.formatRawStructLog(log));
    this.items.push(create);
    this.stack.push(create);
  }

  private handleExitContext(log: RawStructLog<TerminationEvmOpcodes>) {
    this.prevStackTop = this.stack.pop();

    if (log.op == OPCODES.RETURN || log.op === OPCODES.REVERT) {
      const fmtLog = this.formatRawStructLog(log);
      this.prevStackTop.output = fmtLog.memory.read(
        bytes.toInt(fmtLog.stack.peek(0)),
        bytes.toInt(fmtLog.stack.peek(1)),
      );
    }
  }

  private handleLog(log: RawStructLog<LogEvmOpcodes>) {
    const flog = this.formatRawStructLog(log);
    const result: TxTraceLogItem = {
      type: flog.op,
      depth: flog.depth,
      data: flog.memory.read(bytes.toInt(flog.stack.peek(0)), bytes.toInt(flog.stack.peek(1))),
    };

    // lexicographic order works there
    if (flog.op >= OPCODES.LOG1) {
      result.topic1 = flog.stack.peek(2);
    }
    if (flog.op >= OPCODES.LOG2) {
      result.topic2 = flog.stack.peek(3);
    }
    if (flog.op >= OPCODES.LOG3) {
      result.topic3 = flog.stack.peek(4);
    }
    if (flog.op === OPCODES.LOG4) {
      result.topic4 = flog.stack.peek(5);
    }
    this.items.push(result);
  }

  private handleSelfDestruct(log: RawStructLog<SelfDestructEvmOpcodes>) {
    const item = this.seedSelfDestructItem(this.formatRawStructLog(log));

    let destructedCtx: TxTraceCallItem | TxTraceCreateItem | null = null;

    for (let i = 0; i < this.stack.length; ++i) {
      const ctx = this.stack.peek(i);
      // the destructed context depth must be less than the depth of the selfdestruct instruction itself
      if (ctx.depth >= item.depth) continue;

      // when selfdestruct opcode is called via delegatecall or callcode,
      // the parent context will be deleted instead of actual one
      if (ctx.type === "CALLCODE" || ctx.type === "DELEGATECALL") continue;

      // the LOG operations can't call SELFDESTRUCT so skip the also
      if (isLogOpcode(ctx.type)) continue;

      destructedCtx = ctx;
      break;
    }

    if (!destructedCtx) throw new Error(`SELFDESTRUCT callee context not found`);

    item.address = destructedCtx.address;
    this.items.push(item);
    this.prevStackTop = this.stack.pop(); // selfdestruct exits current ctx
  }

  private processStackOutput(log: RawStructLog) {
    // when the struct log depth decreased, we exited previous context
    // the result of the previous operation may be on the stack now
    if (this.prevLog && this.prevLog.depth > log.depth) {
      if (this.prevStackTop === null) {
        throw new Error(`Invalid prev stack top value`);
      }
      const ctx = this.prevStackTop;
      // call operations returns the success as the stack output
      if (isCallOpcode(ctx.type)) {
        (ctx as TxTraceCallItem).success = bytes.toInt(this.formatRawStructLog(log).stack.peek(0)) === 1;
      } else if (isCreateOpcode(ctx.type)) {
        ctx.address = bytes.slice(this.formatRawStructLog(log).stack.peek(0), -20);
      }
    }
  }

  private seedCallInstruction(structLog: FormattedStructLog<CallEvmOpcodes>): TxTraceCallItem {
    const value = structLog.op === OPCODES.CALL ? bytes.toBigInt(structLog.stack.peek(2)) : 0n;
    const calldataStackIndices = structLog.op === OPCODES.CALL ? [3, 4] : [2, 3];

    const res: TxTraceCallItem = {
      type: structLog.op,
      gasLimit: structLog.gas,
      depth: structLog.depth,
      input: structLog.memory.read(
        bytes.toInt(structLog.stack.peek(calldataStackIndices[0])),
        bytes.toInt(structLog.stack.peek(calldataStackIndices[1])),
      ),
      address: bytes.slice(structLog.stack.peek(1), -20),
      value,
      output: "0x",
      success: true,
      gasSpent: 0,
      gasProvided: 0,
    };
    if (structLog.error !== undefined) {
      res.success = false;
    }
    return res;
  }

  private seedRootCall(root: TxTraceInput): TxTraceCallItem {
    const { gasLimit, data, value, address } = root;

    return {
      type: OPCODES.CALL,
      depth: 0,
      gasLimit: Number(gasLimit ?? 0),
      gasSpent: 0,
      gasProvided: 0,
      input: bytes.normalize(data ?? ""),
      value: value ?? 0n,
      address: bytes.normalize(address ?? ""),
      output: "0x",
      success: true,
    };
  }

  private seedCreateItem(structLog: FormattedStructLog<CreateEvmOpcodes>): TxTraceCreateItem {
    return {
      success: true,
      type: structLog.op,
      depth: structLog.depth,
      output: "0x",
      gasSpent: 0,
      gasProvided: 0,
      input: structLog.memory.read(bytes.toInt(structLog.stack.peek(1)), bytes.toInt(structLog.stack.peek(2))),
      value: bytes.toBigInt(structLog.stack.peek(0)),
      address: "0x",
      salt: structLog.op === OPCODES.CREATE2 ? structLog.stack.peek(3) : undefined,
    };
  }

  private seedSelfDestructItem(structLog: FormattedStructLog): TxTraceSelfDestructItem {
    return {
      type: OPCODES.SELFDESTRUCT,
      depth: structLog.depth,
      address: "0x",
      beneficiary: bytes.slice(structLog.stack.peek(0), -20),
    };
  }

  private formatRawStructLog<T extends EvmOpcode>(structLog: RawStructLog<T>): FormattedStructLog<T> {
    const res: FormattedStructLog<T> = {
      depth: structLog.depth,
      gas: Number(structLog.gas),
      gasCost: structLog.gasCost,
      op: structLog.op,
      pc: structLog.pc,
      stack: new ReadOnlyEVMStack(structLog.stack || []),
      memory: new ReadOnlyEVMMemory(structLog.memory || []),
    };
    if (structLog.error) {
      res.error = structLog.error;
    }
    return res;
  }
}

class Stack<T> {
  private readonly items: T[] = [];

  peek(offset: number = 0): T {
    if (this.items.length === 0) {
      throw new Error("stack is empty");
    }

    const minAllowedIndex = -this.items.length;
    const maxAllowedIndex = this.items.length - 1;

    if (offset < minAllowedIndex && offset > maxAllowedIndex) {
      throw new Error(`Offset out of bounds`);
    }

    const index = (this.items.length + offset) % this.items.length;

    return this.items[this.items.length - index - 1];
  }

  pop(): T {
    if (this.items.length === 0) {
      throw new Error("stack is empty");
    }
    return this.items.pop()!;
  }

  push(item: T) {
    this.items.push(item);
  }

  get length(): number {
    return this.items.length;
  }
}

class ReadOnlyEVMMemory {
  private readonly memory: string;

  constructor(memory: string[]) {
    this.memory = memory.join("");
  }

  read(offset: number, size: number): HexStrPrefixed {
    // TODO: maybe throw an error when offset is exceeds memory length
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
    return bytes.normalize(bytes.padStart(item, 32));
  }
}
