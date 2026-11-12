import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { toHex, type Hex } from "viem";
import type { DevRpcClient } from "@/src/network";
import type { UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";
import { runSnapshots } from "@/tasks/sub-tasks/snapshot";
import { createInProcessDevRpcClient } from "@/test/depot/helpers/create-dev-client";
import { readStorageWord } from "@/test/protocol/helpers/storage";

// A first-slots target: its root slot is sampled
const target = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const sampledSlot = toHex(5n, { size: 32 });
const beforeWord = toHex(1_000n, { size: 32 });
const afterWord = toHex(2_000n, { size: 32 });
const runOptions = { createsVote: false, suites: ["first-slots"] };

describe("Upgrade snapshot mechanism (in-process integration)", function () {
  let client: DevRpcClient;
  let snapshotId: Hex;
  let executions: number;

  before(async function () {
    client = await createInProcessDevRpcClient();
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
    executions = 0;
    await client.send("hardhat_setStorageAt", [target, sampledSlot, beforeWord]);
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  async function state() {
    const block = await client.viemClient.getBlock({ blockTag: "latest" });
    return {
      blockNumber: block.number,
      timestamp: block.timestamp,
      word: await readStorageWord(client, target, sampledSlot, block.number),
    };
  }

  function emulateUpgrade(upgradedSlot: Hex) {
    return async (hooks: UpgradeSnapshotHooks): Promise<void> => {
      const initial = await state();
      executions++;
      await client.withSnapshot(async () => {
        await hooks.beforeExecution();
        assert.deepEqual(await state(), initial, "reference capture restores its block, time and storage");
        await client.send("hardhat_setStorageAt", [target, upgradedSlot, afterWord]);
        await client.withSnapshot(async () => {
          await hooks.afterExecution();
          const aligned = await state();
          assert.equal(aligned.blockNumber, initial.blockNumber + 1_000n);
          assert.equal(aligned.timestamp, initial.timestamp + 14n * 24n * 60n * 60n);
        });
      });
    };
  }

  it("rejects a sampled storage change with exact nested evidence and restores failed runs", async function () {
    const initial = await state();
    await rejects(runSnapshots(client, emulateUpgrade(sampledSlot), runOptions), (error: unknown) => {
      if (!(error instanceof AggregateError)) {
        return false;
      }
      const nested: unknown = error.errors[0];
      if (!(nested instanceof Error) || !("actual" in nested)) {
        return false;
      }
      assert.include(nested.message, "Unexpected upgrade snapshot differences at first-slots/init");
      const actual = typeof nested.actual === "string" ? nested.actual : JSON.stringify(nested.actual);
      assert.include(actual, `first-slots/init/${target.toLowerCase()}/${sampledSlot}`);
      assert.match(actual, new RegExp(`"before"\\s*:\\s*"${beforeWord}"`));
      assert.match(actual, new RegExp(`"after"\\s*:\\s*"${afterWord}"`));
      return true;
    });
    assert.equal(executions, 1);
    assert.deepEqual(await state(), initial);
  });

  it("rejects a run without cases", async function () {
    await rejects(runSnapshots(client, emulateUpgrade(sampledSlot), { createsVote: false, suites: [] }));
    assert.equal(executions, 0);
  });
});
