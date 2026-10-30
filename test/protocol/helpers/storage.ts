import { type Address, type Hex, keccak256, toHex } from "viem";
import type { DevRpcClient } from "@/src/network";

export async function readStorageWord(
  client: DevRpcClient,
  address: Address,
  slot: bigint | Hex,
  blockNumber: bigint,
): Promise<Hex> {
  return client.send<"eth_getStorageAt", [Address, Hex, Hex], Hex>("eth_getStorageAt", [
    address,
    toHex(BigInt(slot), { size: 32 }),
    toHex(blockNumber),
  ]);
}

export async function readStorageArray(
  client: DevRpcClient,
  address: Address,
  slot: bigint | Hex,
  length: bigint,
  blockNumber: bigint,
): Promise<Hex[]> {
  const start = BigInt(keccak256(toHex(BigInt(slot), { size: 32 })));
  const values: Hex[] = [];
  for (let index = 0n; index < length; index++) {
    values.push(await readStorageWord(client, address, start + index, blockNumber));
  }
  return values;
}
