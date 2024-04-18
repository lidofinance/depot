declare module 'chai' {
  import { BigNumberish } from './global'

  global {
    export namespace Chai {
      interface AssertStatic {
        approximately(act: BigNumberish, exp: BigNumberish, delta: BigNumberish, message?: string | undefined): void

        contains<T = any>(collection: Iterable<T>, item: T, comparator?: (a: T, b: T) => boolean): void

        reverts(promise: Promise<unknown>, error: string, args?: any[]): Promise<void>
      }
    }
  }
}
