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
      }
    }
  }
}
