declare module "chai" {
  global {
    export namespace Chai {
      interface AssertStatic {
        approximately(
          act: bigint | number,
          exp: bigint | number,
          delta: bigint | number,
          message?: string | undefined,
        ): void;

        contains<T = unknown>(collection: Iterable<T>, item: T, comparator?: (a: T, b: T) => boolean): void;

        reverts(promise: Promise<unknown>, error: string, args?: unknown[]): Promise<void>;
      }
    }
  }
}

declare module "prettier-plugin-solidity" {
  import type { Plugin } from "prettier";

  const plugin: Plugin;
  export default plugin;
}
