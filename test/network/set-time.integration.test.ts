import { assert } from "chai";

import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";

describe("DevRpcClient.setTime / advanceTime (integration)", function () {
  let client: DevRpcClient;

  before(async function () {
    client = await createInProcessDevRpcClient();
  });

  it("setTime lands the next block on the exact target timestamp", async function () {
    const now = await client.getChainTime();
    const target = now + 3600;

    await client.setTime(target);

    assert.equal(await client.getChainTime(), target);
  });

  it("setTime followed by another setTime lands exactly on second target", async function () {
    const now = await client.getChainTime();
    const target1 = now + 1000;
    const target2 = target1 + 500;

    await client.setTime(target1);
    assert.equal(await client.getChainTime(), target1);

    await client.setTime(target2);
    assert.equal(await client.getChainTime(), target2);
  });

  it("advanceTime advances chain time by exactly N seconds", async function () {
    const before = await client.getChainTime();

    await client.advanceTime(42);

    assert.equal(await client.getChainTime(), before + 42);
  });

  it("advanceTime called twice is cumulative and exact", async function () {
    const before = await client.getChainTime();

    await client.advanceTime(100);
    await client.advanceTime(50);

    assert.equal(await client.getChainTime(), before + 150);
  });

  it("advanceTime(1) after setTime(T) yields T + 1 exactly (fixes the increaseTime bug)", async function () {
    const now = await client.getChainTime();
    const target = now + 10_000;

    await client.setTime(target);
    assert.equal(await client.getChainTime(), target);

    await client.advanceTime(1);
    assert.equal(await client.getChainTime(), target + 1);
  });

  it("setTime accepts bigint", async function () {
    const now = await client.getChainTime();
    const target = BigInt(now) + 7200n;

    await client.setTime(target);

    assert.equal(BigInt(await client.getChainTime()), target);
  });
});
