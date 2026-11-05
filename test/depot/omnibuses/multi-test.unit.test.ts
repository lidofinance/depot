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

  it("waits for a suite before starting the next one and stops on failure", async () => {
    const state = { value: "post-omnibus" };
    const suiteError = new Error("staking-modules suite failed");
    const started: string[] = [];
    let rejectSuite: (error: Error) => void = () => assert.fail("suite was not started");
    const suite = new Promise<void>((_resolve, reject) => {
      rejectSuite = reject;
    });

    const run = runRepositorySuites(createSnapshotClient(state), ["staking-modules", "stonks"], (repository) => {
      started.push(repository);
      state.value = "staking-modules mutation";
      return suite;
    });

    assert.deepEqual(started, ["staking-modules"]);
    rejectSuite(suiteError);
    let thrown: unknown;
    try {
      await run;
    } catch (error) {
      thrown = error;
    }
    assert.strictEqual(thrown, suiteError);
    assert.deepEqual(started, ["staking-modules"]);
    assert.equal(state.value, "post-omnibus");
  });
});

describe("omnibus multi-test task lifecycle", () => {
  let hre: HardhatRuntimeEnvironment;
  let client: sinon.SinonStubbedInstance<DevRpcClient>;
  let omnibus: Omnibus;
  let stopNode: sinon.SinonStub;
  let load: sinon.SinonStub;
  let prepare: sinon.SinonStub;
  let runRepo: sinon.SinonStub;
  let log: sinon.SinonStub;

  before(async () => {
    hre = await createHardhatRuntimeEnvironment({ tasks: omnibusTaskBuilders.map((builder) => builder.build()) });
  });

  beforeEach(() => {
    log = sinon.stub(console, "log");
    client = sinon.createStubInstance(DevRpcClient);
    client.snapshot.resolves("0x1");
    client.revert.resolves();
    client.withSnapshot.callsFake(DevRpcClient.prototype.withSnapshot.bind(client));
    omnibus = Omnibus.create({ network: "mainnet", upgrade: false, testVote: () => Promise.resolve() });
    sinon.stub(omnibus, "passOmnibus").resolves();
    load = sinon.stub(multiTestDeps, "loadOmnibus").resolves(omnibus);
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

  it("reports a failed node cleanup and rethrows the original error", async () => {
    sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs: true });
    const failure = new Error("prepare failed");
    prepare.rejects(failure);
    stopNode.rejects(new Error("node stop failed"));
    const logError = sinon.stub(console, "error");

    await rejects(hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "core" }), failure);

    sinon.assert.calledOnce(stopNode);
    sinon.assert.calledOnce(logError);
  });

  it("runs only the suites that cover the vote network", async () => {
    const prepareNode = sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs: false });
    const hoodiOmnibus = Omnibus.create({ network: "hoodi", upgrade: false, testVote: () => Promise.resolve() });
    sinon.stub(hoodiOmnibus, "passOmnibus").resolves();
    load.resolves(hoodiOmnibus);

    await hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture" });

    sinon.assert.calledWithExactly(prepareNode, "hoodi", undefined);
    sinon.assert.calledWith(
      log,
      "Skipping dual-governance, scripts, staking-modules, stonks: no hoodi regression suite",
    );
    assert.deepEqual(
      runRepo.getCalls().map((call) => [call.args[0], call.args[1]]),
      [["core", "hoodi"]],
    );
  });

  it("rejects a repo without a suite for the vote network before starting the node", async () => {
    const prepareNode = sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs: true });
    load.resolves(Omnibus.create({ network: "hoodi", upgrade: false, testVote: () => Promise.resolve() }));

    await rejects(
      hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "scripts" }),
      /No hoodi regression suite in scripts/,
    );

    sinon.assert.notCalled(prepareNode);
    sinon.assert.notCalled(runRepo);
  });
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

  for (const failureStage of ["connect", "pin"] as const) {
    it(`stops the newly started container if subsequent ${failureStage} validation fails`, async () => {
      connect.onFirstCall().rejects(new Error("No existing node"));
      if (failureStage === "connect") {
        connect.onSecondCall().rejects(new Error("Started node is unavailable"));
      } else {
        client.getBlockNumber.resolves(124n);
      }

      await rejects(
        multiTestDeps.prepareLocalRpcNode("mainnet", 123n),
        failureStage === "connect" ? /Started node is unavailable/ : /fork block 123 was requested/,
      );

      sinon.assert.calledOnce(launch);
      sinon.assert.calledOnce(stop);
    });
  }

  it("returns ownership only after a newly started node passes its pin check", async () => {
    connect.onFirstCall().rejects(new Error("No existing node"));
    const node = await multiTestDeps.prepareLocalRpcNode("mainnet", 123n);
    assert.isTrue(node.startedByUs);
    sinon.assert.calledOnce(launch);
    assert.deepEqual(launch.firstCall.args[2], ["npx", "hardhat", "node", "--fork-block-number", "123"]);
    sinon.assert.notCalled(stop);
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
