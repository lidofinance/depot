import { assert } from "chai";
import type { Context } from "mocha";
import { isDeepStrictEqual } from "node:util";
import type { Address } from "viem";
import type { DevRpcClient } from "@/src/network";
import type { UpgradeSnapshotConfig, UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";

export interface SnapshotContext {
  client: DevRpcClient;
  config: UpgradeSnapshotConfig;
  createsVote: boolean;
  testUpgrade: (hooks: UpgradeSnapshotHooks) => Promise<void>;
  checkedChanges: Set<string>;
}

interface SnapshotMochaContext extends Context {
  snapshotContext?: SnapshotContext;
}

export function getSnapshotContext(context: SnapshotMochaContext): SnapshotContext {
  if (!context.snapshotContext) {
    throw new Error("Upgrade snapshots must run through an opted-in omnibus:test upgrade lifecycle");
  }
  return context.snapshotContext;
}

export function hasExpectedSnapshotChange(context: SnapshotContext, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(context.config.expectedChanges ?? {}, key);
}

export async function getLocalAccount(client: DevRpcClient, index: number): Promise<Address> {
  const accounts = await client.getAccounts();
  if (index >= accounts.length) {
    throw new Error(`Upgrade snapshot requires local account ${index}`);
  }
  return accounts[index];
}

// Checks an undeclared field against an absolute tolerance and removes it from the exact comparison
export function assertWithinTolerance(
  context: SnapshotContext,
  scope: string,
  field: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tolerance: bigint,
): void {
  if (hasExpectedSnapshotChange(context, `${scope}/${field}`)) {
    return;
  }
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

export function assertSnapshot(
  context: SnapshotContext,
  scope: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  const differences: Record<string, unknown> = {};
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const key = `${scope}/${field}`;
    const changed =
      !isDeepStrictEqual(before[field], after[field]) ||
      Object.prototype.hasOwnProperty.call(before, field) !== Object.prototype.hasOwnProperty.call(after, field);
    const expected = context.config.expectedChanges?.[key];
    if (expected) {
      context.checkedChanges.add(key);
      const matchesBefore =
        !Object.prototype.hasOwnProperty.call(expected, "before") || isDeepStrictEqual(before[field], expected.before);
      if (!changed || !matchesBefore || !isDeepStrictEqual(after[field], expected.after)) {
        differences[key] = { expected, actual: { before: before[field], after: after[field] } };
      }
    } else if (changed) {
      differences[key] = { before: before[field], after: after[field] };
    }
  }
  assert.deepEqual(differences, {}, `Unexpected upgrade snapshot differences at ${scope}`);
}
