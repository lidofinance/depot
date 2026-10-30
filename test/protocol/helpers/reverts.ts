import { rejects } from "node:assert/strict";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  encodeAbiParameters,
  encodeErrorResult,
  isHex,
  keccak256,
  parseAbi,
  parseAbiParameters,
  slice,
  stringToHex,
  type Hex,
} from "viem";

const solidityErrorAbi = parseAbi(["error Error(string reason)"]);

export function revertData(error: unknown): Hex | undefined {
  if (!(error instanceof BaseError)) {
    return undefined;
  }
  const revert = error.walk(
    (cause) =>
      cause instanceof ContractFunctionRevertedError ||
      (cause instanceof Error && "data" in cause && typeof cause.data === "string"),
  );
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.raw;
  }
  // In-process EDR exposes revert bytes without an RPC error code
  if (revert instanceof Error && "data" in revert && isHex(revert.data)) {
    return revert.data;
  }
  return undefined;
}

export function isRevertedWith(error: unknown, expected: Hex): boolean {
  return revertData(error) === expected;
}

export async function expectRevert(action: Promise<unknown>, expected: Hex, message?: string): Promise<void> {
  await rejects(action, (error: unknown) => isRevertedWith(error, expected), message);
}

export function solidityError(reason: string): Hex {
  return encodeErrorResult({ abi: solidityErrorAbi, errorName: "Error", args: [reason] });
}

export function customError(signature: string, args: readonly (bigint | Hex)[] = []): Hex {
  const types = signature.slice(signature.indexOf("(") + 1, -1);
  return concat([
    slice(keccak256(stringToHex(signature)), 0, 4),
    types ? encodeAbiParameters(parseAbiParameters(types), args) : "0x",
  ]);
}
