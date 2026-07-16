// Generic LIFO stack used by the struct-log tracing visitor to track context
// frames and gas accounting entries. Intentionally small — no iteration, no
// swap, no search — only push/pop/peek with cyclic offset lookup.
export class Stack<T> {
  private readonly items: T[] = [];

  peek(offset: number = 0): T {
    if (this.items.length === 0) {
      throw new Error("stack is empty");
    }

    const minAllowedIndex = -this.items.length;
    const maxAllowedIndex = this.items.length - 1;

    if (offset < minAllowedIndex || offset > maxAllowedIndex) {
      throw new Error(`Offset ${offset} out of bounds [${minAllowedIndex}, ${maxAllowedIndex}]`);
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
