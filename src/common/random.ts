import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";

function randomHex(lengthBytes: number): Hex {
  return `0x${randomBytes(lengthBytes).toString("hex")}`;
}

export function randomAddress(): Address {
  return randomHex(20) as Address;
}

export function randomHash(): Hex {
  return randomHex(32);
}
