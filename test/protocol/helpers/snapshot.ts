import { assert } from "chai";
import type { Context } from "mocha";
import { isDeepStrictEqual } from "node:util";
import type { Address } from "viem";
import type { DevRpcClient } from "@/src/network";
import type { UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";

export interface SnapshotContext {
  client: DevRpcClient;
  network: "mainnet" | "hoodi";
  createsVote: boolean;
  testUpgrade: (hooks: UpgradeSnapshotHooks) => Promise<void>;
}

interface SnapshotMochaContext extends Context {
  snapshotContext?: SnapshotContext;
}

export function getSnapshotContext(context: SnapshotMochaContext): SnapshotContext {
  if (!context.snapshotContext) {
    throw new Error("Upgrade snapshots must run through the omnibus:test upgrade lifecycle");
  }
  return context.snapshotContext;
}

export async function getLocalAccount(client: DevRpcClient, index: number): Promise<Address> {
  const accounts = await client.getAccounts();
  if (index >= accounts.length) {
    throw new Error(`Upgrade snapshot requires local account ${index}`);
  }
  return accounts[index];
}

// Checks a field against an absolute tolerance and removes it from the exact comparison
export function assertWithinTolerance(
  scope: string,
  field: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tolerance: bigint,
): void {
  const oldValue = before[field];
  const newValue = after[field];
  if (typeof oldValue !== "bigint" || typeof newValue !== "bigint") {
    throw new Error(`${scope}/${field} is not an integer observation`);
  }
  const difference = oldValue > newValue ? oldValue - newValue : newValue - oldValue;
  assert.isTrue(difference <= tolerance, `${scope}/${field}: absolute tolerance ${tolerance}`);
  delete before[field];
  delete after[field];
}

export function assertSnapshot(scope: string, before: Record<string, unknown>, after: Record<string, unknown>): void {
  const differences: Record<string, unknown> = {};
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const changed =
      !isDeepStrictEqual(before[field], after[field]) ||
      Object.prototype.hasOwnProperty.call(before, field) !== Object.prototype.hasOwnProperty.call(after, field);
    if (changed) {
      differences[`${scope}/${field}`] = { before: before[field], after: after[field] };
    }
  }
  assert.deepEqual(differences, {}, `Unexpected upgrade snapshot differences at ${scope}`);
}
