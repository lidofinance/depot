import { assert } from "chai";

import { DevRpcClient } from "@/src/network/dev-rpc-client";
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

  it("advanceTime(1) after setTime(T) yields T + 1 exactly (fixes the increaseTime bug)", async function () {
    const now = await client.getChainTime();
    const target = now + 10_000;

    await client.setTime(target);
    assert.equal(await client.getChainTime(), target);

    await client.advanceTime(1);
    assert.equal(await client.getChainTime(), target + 1);
  });
});
