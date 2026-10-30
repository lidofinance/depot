import { rejects } from "node:assert/strict";
import { assert } from "chai";
import sinon from "sinon";
import { parseEther, toHex, type Hex } from "viem";
import type { DevRpcClient } from "@/src/network";
import type { UpgradeSnapshotConfig, UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";
import { runSnapshots } from "@/tasks/sub-tasks/snapshot";
import { createInProcessDevRpcClient } from "@/test/depot/helpers/create-dev-client";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import { readStorageWord } from "@/test/protocol/helpers/storage";

const target = "0x000000000000000000000000000000000000cafe";
const slot = toHex(0x5a17n, { size: 32 });
const beforeWord = toHex(1_000n, { size: 32 });
const afterWord = toHex(2_000n, { size: 32 });
const fieldKey = `first-slots/init/${target}/${slot}`;
const configuration = {
  suites: ["first-slots"],
  storage: [{ address: target, slot }],
} as const satisfies UpgradeSnapshotConfig;
const runOptions = { createsVote: false };

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
    await client.send("hardhat_setStorageAt", [target, slot, beforeWord]);
  });

  afterEach(async function () {
    sinon.restore();
    await client.revert(snapshotId);
  });

  async function state() {
    const block = await client.viemClient.getBlock({ blockTag: "latest" });
    return {
      blockNumber: block.number,
      timestamp: block.timestamp,
      word: await readStorageWord(client, target, slot, block.number),
    };
  }

  async function emulateUpgrade(hooks: UpgradeSnapshotHooks): Promise<void> {
    const initial = await state();
    executions++;
    await client.withSnapshot(async () => {
      await hooks.beforeExecution();
      assert.deepEqual(await state(), initial, "reference capture restores its block, time and storage");
      await client.send("hardhat_setStorageAt", [target, slot, afterWord]);
      await client.withSnapshot(async () => {
        await hooks.afterExecution();
        const aligned = await state();
        assert.equal(aligned.blockNumber, initial.blockNumber + 1_000n);
        assert.equal(aligned.timestamp, initial.timestamp + 14n * 24n * 60n * 60n);
        assert.equal(aligned.word, afterWord);
      });
    });
  }

  it("reloads the real suite, accepts declared storage changes and restores both runs", async function () {
    const initial = await state();
    const setTime = sinon.spy(client, "setTime");
    const send = sinon.spy(client, "send");
    const config = {
      ...configuration,
      expectedChanges: { [fieldKey]: { before: beforeWord, after: afterWord } },
    };

    await runSnapshots(client, config, emulateUpgrade, runOptions);
    assert.deepEqual(await state(), initial);
    await runSnapshots(client, config, emulateUpgrade, runOptions);
    assert.deepEqual(await state(), initial);
    assert.equal(executions, 2, "each runner invocation reloads and executes the selected suite");
    assert.equal(setTime.callCount, 4, "both branches of both runs align their timestamps");
    for (const call of setTime.getCalls()) {
      assert.equal(call.args[0], initial.timestamp + 14n * 24n * 60n * 60n);
    }
    const alignedReads = send.getCalls().filter((call) => {
      const [method, parameters] = call.args;
      return (
        method === "eth_getStorageAt" &&
        parameters[0] === target &&
        parameters[1] === slot &&
        parameters[2] === toHex(initial.blockNumber + 1_000n)
      );
    });
    assert.lengthOf(alignedReads, 6, "four branch captures and two upgraded-state assertions use the aligned block");
  });

  it("rejects undeclared storage changes with exact nested evidence and restores failed runs", async function () {
    const initial = await state();
    await rejects(runSnapshots(client, configuration, emulateUpgrade, runOptions), (error: unknown) => {
      if (!(error instanceof AggregateError)) {
        return false;
      }
      const nested: unknown = error.errors[0];
      if (!(nested instanceof Error) || !("actual" in nested)) {
        return false;
      }
      assert.include(nested.message, "Unexpected upgrade snapshot differences at first-slots/init");
      const actual = typeof nested.actual === "string" ? nested.actual : JSON.stringify(nested.actual);
      assert.include(actual, fieldKey);
      assert.match(actual, new RegExp(`"before"\\s*:\\s*"${beforeWord}"`));
      assert.match(actual, new RegExp(`"after"\\s*:\\s*"${afterWord}"`));
      return true;
    });
    assert.equal(executions, 1);
    assert.deepEqual(await state(), initial);
  });

  it("rejects stale expected changes even after an otherwise successful comparison and restores state", async function () {
    const initial = await state();
    const staleKey = `first-slots/init/${target}/${toHex(0x5a18n, { size: 32 })}`;
    await rejects(
      runSnapshots(
        client,
        {
          ...configuration,
          expectedChanges: {
            [fieldKey]: { before: beforeWord, after: afterWord },
            [staleKey]: { before: beforeWord, after: afterWord },
          },
        },
        emulateUpgrade,
        runOptions,
      ),
      (error: unknown) => {
        assert.instanceOf(error, Error);
        assert.include(String(error), `Unobserved expected upgrade snapshot changes: ${staleKey}`);
        return true;
      },
    );
    assert.equal(executions, 1);
    assert.deepEqual(await state(), initial);
  });

  it("preserves an impersonated account's balance on request while retaining the default funding", async function () {
    const account = "0x000000000000000000000000000000000000beef";
    const accounts = new ImpersonatedAccounts();
    await client.setBalance(account, parseEther("7"));
    try {
      await accounts.impersonate(client, account, { preserveBalance: true });
      assert.equal(await client.getBalance(account), parseEther("7"));
      await accounts.stopAll(client);
      assert.equal(await client.getBalance(account), parseEther("7"));
      await accounts.impersonate(client, account);
      assert.equal(await client.getBalance(account), parseEther("10"));
    } finally {
      await accounts.stopAll(client);
    }
  });
});
