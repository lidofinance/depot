import { assert } from "chai";
import Docker from "dockerode";
import sinon from "sinon";

import { OwnedContainers } from "@/src/docker/owned-containers";

const flushEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("owned containers shutdown", () => {
  afterEach(() => sinon.restore());

  it("waits for a create in flight and stops the container it reports", async () => {
    const registry = new OwnedContainers();
    const docker = new Docker();
    const exited = docker.getContainer("exited-container");
    const late = docker.getContainer("late-container");
    const exitedStop = sinon.stub(exited, "stop").resolves();
    const lateStop = sinon.stub(late, "stop").resolves();

    registry.track(exited);
    registry.untrack(exited);
    const settleCreate = registry.beginCreate();

    let stopped = false;
    const stopping = registry.stopAll().then(() => {
      stopped = true;
    });
    await flushEventLoop();
    assert.isFalse(stopped);

    registry.track(late);
    settleCreate();
    settleCreate();
    await stopping;

    sinon.assert.calledOnce(lateStop);
    sinon.assert.notCalled(exitedStop);
  });
});
