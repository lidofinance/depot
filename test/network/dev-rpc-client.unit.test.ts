import { assert } from "chai";
import { rejects } from "node:assert/strict";
import sinon from "sinon";

import { DevRpcClient } from "../../src/network";

describe("DevRpcClient snapshot handling", () => {
  let client: sinon.SinonStubbedInstance<DevRpcClient>;

  beforeEach(() => {
    client = sinon.createStubInstance(DevRpcClient);
    client.snapshot.resolves("0x1");
    client.withSnapshot.callsFake(DevRpcClient.prototype.withSnapshot.bind(client));
  });

  afterEach(() => sinon.restore());

  it("reverts through evm_revert and accepts a truthful node answer", async () => {
    client.send.resolves(true);

    await DevRpcClient.prototype.revert.call(client, "0x1");

    sinon.assert.calledOnceWithExactly(client.send, "evm_revert", ["0x1"]);
  });

  it("throws when the node reports the snapshot was not restored", async () => {
    client.send.resolves(false);

    await rejects(DevRpcClient.prototype.revert.call(client, "0x2"), /evm_revert for snapshot 0x2 returned false/);
  });

  it("keeps the callback error when the revert of a failed callback also throws", async () => {
    const logError = sinon.stub(console, "error");
    const callbackError = new Error("callback failed");
    client.revert.rejects(new Error("revert failed"));

    await rejects(
      client.withSnapshot(() => Promise.reject(callbackError)),
      callbackError,
    );

    sinon.assert.calledOnce(client.revert);
    sinon.assert.calledOnce(logError);
  });

  it("propagates a revert failure of a successful callback", async () => {
    const revertError = new Error("revert failed");
    client.revert.rejects(revertError);

    let thrown: unknown;
    try {
      await client.withSnapshot(() => Promise.resolve("done"));
    } catch (error) {
      thrown = error;
    }

    assert.strictEqual(thrown, revertError);
  });
});
