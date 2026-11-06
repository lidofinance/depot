import bytes, { HexStrPrefixed } from "../common/bytes";

// Read-only snapshots of EVM runtime components as captured in a single
// struct log entry. Both wrap raw hex data from debug_traceTransaction and
// expose minimal accessors used by the tracing visitor.

export class ReadOnlyEVMMemory {
  private readonly memory: string;

  constructor(memory: string[]) {
    this.memory = memory.join("");
  }

  read(offset: number, size: number): HexStrPrefixed {
    return bytes.normalize(this.memory.slice(2 * offset, 2 * (offset + size)));
  }
}

export class ReadOnlyEVMStack {
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
