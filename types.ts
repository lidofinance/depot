type EVMScript = string;

type Address = string;
type Addressable = { address: Address };

type NetworkName = "mainnet" | "goerli" | "sepolia";

declare module "chai" {
  import { BigNumberish } from "ethers";

  global {
    export namespace Chai {
      interface AssertStatic {
        approximately(
          act: BigNumberish,
          exp: BigNumberish,
          delta: BigNumberish,
          message?: string | undefined,
        ): void;

        contains<T = any>(
          collection: Iterable<T>,
          item: T,
          comparator?: (a: T, b: T) => boolean,
        ): void;
      }
    }
  }
}
