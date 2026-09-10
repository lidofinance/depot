import { assert } from "chai";
import Docker from "dockerode";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import sinon from "sinon";

import { runImageInBackground } from "../../src/docker";

describe("background node container ownership", () => {
  const originalCwd = process.cwd();
  let fixtureDir: string;
  let clock: sinon.SinonFakeTimers;
  let container: Docker.Container;
  let logs: PassThrough;
  let run: sinon.SinonStub<Parameters<Docker["run"]>, ReturnType<Docker["run"]>>;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "depot-background-node-"));
    process.chdir(fixtureDir);
    clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    sinon.stub(console, "log");
    container = new Docker().getContainer("owned-node");
    logs = new PassThrough();
    sinon.stub(container, "logs").resolves(logs);
    sinon.stub(Docker.prototype, "getContainer").returns(container);
    const listed = sinon.stub(Docker.prototype, "listContainers");
    listed.onFirstCall().resolves([]);
    listed.onSecondCall().resolves([
      {
        Id: "owned-node",
        Names: ["/fixture-node"],
        Image: "cached-node:local",
        ImageID: "cached-node",
        Command: "npm start",
        Created: 0,
        Ports: [],
        Labels: {},
        State: "running",
        Status: "Up",
        HostConfig: { NetworkMode: "default" },
        NetworkSettings: { Networks: {} },
        Mounts: [],
      },
    ]);
    sinon.stub(Docker.prototype, "listImages").resolves([
      {
        Id: "cached-node",
        ParentId: "",
        RepoTags: ["cached-node:local"],
        Created: 0,
        Size: 0,
        VirtualSize: 0,
        SharedSize: 0,
        Labels: {},
        Containers: 0,
      },
    ]);
    run = sinon.stub(Docker.prototype, "run").resolves();
  });

  afterEach(async () => {
    const output = run.firstCall?.args[2];
    if (output && !Array.isArray(output)) {
      await new Promise<void>((resolve) => output.end(resolve));
    }
    logs.destroy();
    clock.restore();
    sinon.restore();
    process.chdir(originalCwd);
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it("retains the created container handle when its readiness log times out", async () => {
    const launched = runImageInBackground("fixture-node", "cached-node:local", ["npm", "start"]);
    await clock.tickAsync(12_000);
    assert.isTrue((await launched) === container, "must retain the created container handle");
    sinon.assert.calledOnce(run);
  });

  it("returns the same container when the readiness message arrives", async () => {
    const launched = runImageInBackground("fixture-node", "cached-node:local", ["npm", "start"]);
    await clock.tickAsync(2_000);
    logs.write("Started HTTP and WebSocket JSON-RPC server");
    assert.isTrue((await launched) === container, "must retain the created container handle");
    sinon.assert.calledOnce(run);
  });
});
