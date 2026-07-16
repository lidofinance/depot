import bytes, { HexStrPrefixed } from "../common/bytes";

// Read-only snapshots of EVM runtime components as captured in a single
// struct log entry. Both wrap raw hex data from debug_traceTransaction and
// expose minimal accessors used by the tracing visitor.

export interface EVMMemoryReader {
  read(offset: number, size: number): HexStrPrefixed;
}

export interface EVMStackReader {
  peek(offset?: number): HexStrPrefixed;
}

export class ReadOnlyEVMMemory implements EVMMemoryReader {
  private readonly memory: string;

  constructor(memory: string[]) {
    this.memory = memory.join("");
  }

  read(offset: number, size: number): HexStrPrefixed {
    // TODO: maybe throw an error when offset is exceeds memory length
    return bytes.normalize(this.memory.slice(2 * offset, 2 * (offset + size)));
  }
}

export class ReadOnlyEVMStack implements EVMStackReader {
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
