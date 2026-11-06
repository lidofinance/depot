import { assert } from "chai";
import sinon from "sinon";
import Docker from "dockerode";
import { rejects } from "node:assert/strict";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { Omnibus } from "@/src/omnibuses/omnibus";

import { DevRpcClient } from "@/src/network";
import {
  getRepositorySuites,
  runRepositorySuites,
  multiTestDeps,
  omnibusTaskBuilders,
  omnibusTaskDeps,
} from "@/tasks/omnibuses";

interface ForkState {
  value: string;
}

function createSnapshotClient(state: ForkState): Pick<DevRpcClient, "withSnapshot"> {
  return {
    async withSnapshot<T>(callback: () => Promise<T> | T): Promise<T> {
      const snapshot = state.value;
      try {
        return await callback();
      } finally {
        state.value = snapshot;
      }
    },
  };
}

describe("omnibus multi-test repository suites", () => {
  afterEach(() => sinon.restore());

  it("starts every repository suite from the same post-omnibus fork state", async () => {
    sinon.stub(console, "log");
    const state = { value: "post-omnibus" };
    const observedStates: Array<[string, string]> = [];

    await runRepositorySuites(createSnapshotClient(state), getRepositorySuites(), (repository) => {
      observedStates.push([repository, state.value]);
      state.value = `${repository} mutation`;
      return Promise.resolve();
    });

    assert.deepEqual(observedStates, [
      ["core", "post-omnibus"],
      ["dual-governance", "post-omnibus"],
      ["scripts", "post-omnibus"],
      ["staking-modules", "post-omnibus"],
      ["stonks", "post-omnibus"],
    ]);
    assert.equal(state.value, "post-omnibus");
  });
});

describe("omnibus multi-test task lifecycle", () => {
  let hre: HardhatRuntimeEnvironment;
  let client: sinon.SinonStubbedInstance<DevRpcClient>;
  let omnibus: Omnibus;
  let stopNode: sinon.SinonStub;
  let prepare: sinon.SinonStub;
  let runRepo: sinon.SinonStub;

  before(async () => {
    hre = await createHardhatRuntimeEnvironment({ tasks: omnibusTaskBuilders.map((builder) => builder.build()) });
  });

  beforeEach(() => {
    sinon.stub(console, "log");
    client = sinon.createStubInstance(DevRpcClient);
    client.snapshot.resolves("0x1");
    client.revert.resolves();
    client.withSnapshot.callsFake(DevRpcClient.prototype.withSnapshot.bind(client));
    omnibus = Omnibus.create({ network: "mainnet", upgrade: false, testVote: () => Promise.resolve() });
    sinon.stub(omnibus, "passOmnibus").resolves();
    sinon.stub(multiTestDeps, "loadOmnibus").resolves(omnibus);
    prepare = sinon.stub(multiTestDeps, "prepareOmnibus").resolves(omnibus);
    runRepo = sinon.stub(multiTestDeps, "runRepoTests").resolves();
    stopNode = sinon.stub(multiTestDeps, "stopLocalRpcNode").resolves();
  });

  afterEach(() => sinon.restore());

  for (const startedByUs of [false, true]) {
    it(`${startedByUs ? "stops its own" : "keeps a reused"} node when prepare fails`, async () => {
      sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs });
      const failure = new Error("prepare failed");
      prepare.rejects(failure);

      await rejects(hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "core" }), failure);

      sinon.assert.notCalled(runRepo);
      assert.equal(stopNode.callCount, startedByUs ? 1 : 0);
    });
  }
});

describe("multi-test local node acquisition", () => {
  const originalEnv = process.env;
  const originalConnectTimeoutMs = multiTestDeps.localRpcNodeConnectTimeoutMs;
  let client: sinon.SinonStubbedInstance<DevRpcClient>;
  let connect: sinon.SinonStub;
  let launch: sinon.SinonStub;
  let stop: sinon.SinonStub;
  let findContainer: sinon.SinonStub;
  let stopNode: sinon.SinonStub;

  beforeEach(() => {
    process.env = { ...originalEnv, ETH_MAINNET_RPC_URL: "http://localhost:18545" };
    // no retries unless a test asks for them
    multiTestDeps.localRpcNodeConnectTimeoutMs = 0;
    sinon.stub(console, "log");
    client = sinon.createStubInstance(DevRpcClient);
    client.getBlockNumber.resolves(123n);
    client.getRpcUrl.returns("http://localhost:8545");
    connect = sinon.stub(multiTestDeps, "createDevRpcClient").resolves(client);
    const container = new Docker().getContainer("owned-test-node");
    stop = sinon.stub(container, "stop").resolves();
    sinon.stub(container, "rename").resolves();
    launch = sinon.stub(multiTestDeps, "runImageInBackground").resolves(container);
    findContainer = sinon.stub(multiTestDeps, "findContainerByName").resolves(null);
    stopNode = sinon.stub(multiTestDeps, "stopLocalRpcNode").resolves();
    sinon.stub(multiTestDeps, "sleep").resolves();
    sinon.stub(omnibusTaskDeps, "assertNodeOnRealChain").resolves();
  });

  afterEach(() => {
    multiTestDeps.localRpcNodeConnectTimeoutMs = originalConnectTimeoutMs;
    sinon.restore();
    process.env = originalEnv;
  });

  it("reuses an existing pinned node without claiming ownership", async () => {
    const node = await multiTestDeps.prepareLocalRpcNode("mainnet", 123n);
    assert.strictEqual(node.client, client);
    assert.isFalse(node.startedByUs);
    sinon.assert.notCalled(launch);
    sinon.assert.notCalled(stop);
  });

  it("rejects a wrong existing pin without replacing or stopping its node", async () => {
    await rejects(multiTestDeps.prepareLocalRpcNode("mainnet", 124n), /fork block 124 was requested/);
    sinon.assert.notCalled(launch);
    sinon.assert.notCalled(stop);
  });

  it("stops the newly started container if its pin validation fails", async () => {
    connect.onFirstCall().rejects(new Error("No existing node"));
    client.getBlockNumber.resolves(124n);

    await rejects(multiTestDeps.prepareLocalRpcNode("mainnet", 123n), /fork block 123 was requested/);

    sinon.assert.calledOnce(launch);
    sinon.assert.calledOnce(stop);
  });

  it("refuses to replace an unreachable container it does not own", async () => {
    connect.rejects(new Error("No existing node"));
    findContainer.resolves(new Docker().getContainer("foreign-node"));

    await rejects(multiTestDeps.prepareLocalRpcNode("mainnet", 123n), /will not replace a container it does not own/);

    sinon.assert.notCalled(launch);
    sinon.assert.notCalled(stopNode);
    sinon.assert.notCalled(stop);
  });
});
