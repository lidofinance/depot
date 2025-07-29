import type { Abi, AbiParameter, AbiParametersToPrimitiveTypes, AbiFunction, AbiEvent } from "abitype";

export type FindFunctionAbiParams<T extends Abi, N extends string> =
  Extract<T[number], { readonly type: "function"; readonly name: N }> extends { readonly inputs: infer Inputs }
    ? Inputs extends readonly unknown[]
      ? Inputs extends readonly AbiParameter[]
        ? AbiParametersToPrimitiveTypes<Inputs>
        : never
      : never
    : never;

export type FindEventAbiParams<T extends Abi, N extends string> =
  Extract<T[number], { readonly type: "event"; readonly name: N }> extends { readonly inputs: infer Inputs }
    ? Inputs extends readonly unknown[]
      ? Inputs extends readonly AbiParameter[]
        ? AbiParametersToPrimitiveTypes<Inputs>
        : never
      : never
    : never;

export type FilterAbiFunctions<TAbi extends Abi> = Extract<TAbi[number], AbiFunction>;
export type FilterAbiEvents<TAbi extends Abi> = Extract<TAbi[number], AbiEvent>;
