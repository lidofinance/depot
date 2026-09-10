import { assert } from "chai";
import sinon from "sinon";
import Docker from "dockerode";
import { rejects } from "node:assert/strict";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { Omnibus } from "../../src/omnibuses/omnibus";

import { DevRpcClient } from "../../src/network";
import { getRepositorySuites, runRepositorySuites, multiTestDeps, omnibusTaskBuilders } from "../../tasks/omnibuses";
import { containerDeps, runRepoTests } from "../../tasks/sub-tasks/containers";

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

  it("selects all five repository suites by default", () => {
    assert.deepEqual(getRepositorySuites(), ["core", "dual-governance", "scripts", "staking-modules", "stonks"]);
  });

  for (const repo of ["staking-modules", "stonks"]) {
    it(`selects ${repo} alone`, () => {
      assert.deepEqual(getRepositorySuites(repo), [repo]);
    });
  }

  it("rejects unsupported repository names instead of running no suites", () => {
    assert.throws(() => getRepositorySuites("staking-module"), 'Unsupported repo "staking-module"');
  });

  it("propagates a repository suite error to the caller", async () => {
    const state = { value: "post-omnibus" };
    const suiteError = new Error("core suite failed");
    let thrown: unknown;

    try {
      await runRepositorySuites(createSnapshotClient(state), ["core"], () => {
        state.value = "core mutation";
        return Promise.reject(suiteError);
      });
    } catch (error) {
      thrown = error;
    }

    assert.strictEqual(thrown, suiteError);
    assert.equal(state.value, "post-omnibus");
  });

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

describe("new repository target commands", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ETH_LOCAL_RPC_PORT: "18549",
      GIT_BRANCH_STAKING_MODULES: "develop",
      GIT_BRANCH_STONKS: "main",
    };
    sinon.stub(console, "log");
    sinon.stub(containerDeps, "buildRepo").resolves("depot/test:pinned");
  });

  afterEach(() => {
    sinon.restore();
    process.env = originalEnv;
  });

  it("runs both staking module deployments against the local RPC in sequence", async () => {
    const run = sinon.stub(containerDeps, "runTestsFromRepo").resolves();

    await runRepoTests("staking-modules");

    sinon.assert.calledTwice(run);
    const [csm, curated] = run.getCalls();
    assert.deepEqual(csm.args[2], ["just", "test-integration"]);
    assert.deepEqual(curated.args[2], ["just", "test-integration"]);
    assert.includeMembers(csm.args[3].Env ?? [], [
      "RPC_URL=http://host.docker.internal:18549",
      "FOUNDRY_PROFILE=ci_quick",
      "DEPLOY_CONFIG=./artifacts/mainnet/csm/upgrade-v3-mainnet.json",
    ]);
    assert.include(curated.args[3].Env ?? [], "DEPLOY_CONFIG=./artifacts/mainnet/curated/deploy-mainnet.json");
    assert.equal(csm.args[4], 0);
    assert.equal(curated.args[4], 1);
  });

  it("propagates a failed CSM container without starting Curated", async () => {
    const suiteError = new Error("CSM failed");
    const run = sinon.stub(containerDeps, "runTestsFromRepo").rejects(suiteError);
    let thrown: unknown;
    try {
      await runRepoTests("staking-modules");
    } catch (error) {
      thrown = error;
    }
    assert.strictEqual(thrown, suiteError);
    sinon.assert.calledOnce(run);
  });

  it("selects the stonks post-vote suites and passes the local RPC to its adapter", async () => {
    const run = sinon.stub(containerDeps, "runTestsFromRepo").resolves();

    await runRepoTests("stonks");

    sinon.assert.calledOnce(run);
    const [, , cmd, config] = run.firstCall.args;
    assert.include(cmd.join(" "), "--config depot.hardhat.config.ts test --network localhost");
    assert.includeMembers(config.Env ?? [], [
      "RPC_URL=http://host.docker.internal:18549",
      "STONKS_TEST_PATTERN=test/integration/staking-revenue-source.ts test/integration/buyback-happy-path.ts",
    ]);
  });

  it("resolves the default pattern to the mounted example of each repo", async () => {
    const run = sinon.stub(containerDeps, "runTestsFromRepo").resolves();

    await runRepoTests("staking-modules", "default");
    await runRepoTests("stonks", "default");
    await runRepoTests("dual-governance", "default");

    const [stakingModules, , stonks, dualGovernance] = run.getCalls();
    assert.deepEqual(stakingModules.args[2], [
      "forge",
      "test",
      "--match-path",
      "test/custom/*",
      "-vvv",
      "--show-progress",
      "--summary",
      "--detailed",
    ]);
    assert.include(
      stonks.args[3].Env ?? [],
      "STONKS_TEST_PATTERN=test/custom/_example_omnibus_test_for_stonks_repo.ts",
    );
    assert.deepEqual(dualGovernance.args[2], ["npm", "run", "test", "--", "--match-path", "test/custom/*"]);
  });

  it("keeps the scripts default pattern pointing at its mounted example", async () => {
    const run = sinon.stub(containerDeps, "runTestsFromRepo").resolves();

    await runRepoTests("scripts", "default");

    for (const call of run.getCalls()) {
      assert.deepEqual(call.args[2], [
        "poetry",
        "run",
        "brownie",
        "test",
        "tests/custom/_example_omnibus_test_for_scripts_repo.py",
      ]);
    }
  });

  it("passes a custom stonks pattern as data and mounts its test directory", async () => {
    const run = sinon.stub(containerDeps, "runTestsFromRepo").resolves();
    const pattern = "test/custom/**/*.ts";

    await runRepoTests("stonks", pattern, false, true);

    const [, , cmd, config] = run.firstCall.args;
    assert.notInclude(cmd.join(" "), pattern);
    assert.include(config.Env ?? [], `STONKS_TEST_PATTERN=${pattern}`);
    assert.deepEqual(config.HostConfig?.Mounts, [
      { Source: `${process.cwd()}/mount/stonks`, Target: "/usr/src/app/test/custom", Type: "bind" },
    ]);
  });
});

describe("omnibus multi-test task lifecycle", () => {
  let hre: HardhatRuntimeEnvironment;
  let client: sinon.SinonStubbedInstance<DevRpcClient>;
  let omnibus: Omnibus;
  let stopNode: sinon.SinonStub;
  let load: sinon.SinonStub;
  let prepare: sinon.SinonStub;
  let pass: sinon.SinonStub;
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
    omnibus = Omnibus.create({ network: "mainnet", calls: () => [], testVote: () => Promise.resolve() });
    pass = sinon.stub(omnibus, "passOmnibus").resolves();
    load = sinon.stub(multiTestDeps, "loadOmnibus").resolves(omnibus);
    prepare = sinon.stub(multiTestDeps, "prepareOmnibus").resolves(omnibus);
    runRepo = sinon.stub(multiTestDeps, "runRepoTests").resolves();
    stopNode = sinon.stub(multiTestDeps, "stopLocalRpcNode").resolves();
  });

  afterEach(() => sinon.restore());

  for (const startedByUs of [false, true]) {
    for (const stage of ["prepare", "pass"] as const) {
      it(`reverts a ${stage} failure and ${startedByUs ? "stops its own" : "keeps a reused"} node`, async () => {
        sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs });
        const failure = new Error(`${stage} failed`);
        const stub = stage === "prepare" ? prepare : pass;
        stub.rejects(failure);

        await rejects(hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "core" }), failure);

        sinon.assert.calledOnceWithExactly(client.revert, "0x1");
        sinon.assert.notCalled(runRepo);
        assert.equal(stopNode.callCount, startedByUs ? 1 : 0);
      });
    }

    it(`runs a bare fork and ${startedByUs ? "stops its own" : "keeps a reused"} node`, async () => {
      const prepareNode = sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs });
      await hre.tasks.getTask("omnibus:multi-test").run({ repo: "core", forkBlock: "123" });
      sinon.assert.calledWithExactly(prepareNode, "mainnet", 123n);
      sinon.assert.notCalled(load);
      sinon.assert.calledOnce(runRepo);
      sinon.assert.calledTwice(client.revert);
      assert.equal(stopNode.callCount, startedByUs ? 1 : 0);
    });

    it(`reports a failed node cleanup and rethrows the original error (startedByUs: ${startedByUs})`, async () => {
      sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs });
      const failure = new Error("prepare failed");
      prepare.rejects(failure);
      stopNode.rejects(new Error("node stop failed"));
      const logError = sinon.stub(console, "error");

      await rejects(hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "core" }), failure);

      assert.equal(stopNode.callCount, startedByUs ? 1 : 0);
      assert.equal(logError.callCount, startedByUs ? 1 : 0);
    });

    for (const operation of ["snapshot", "revert"] as const) {
      it(`handles ${operation} failure and ${startedByUs ? "stops its own" : "keeps a reused"} node`, async () => {
        sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs });
        const failure = new Error(`${operation} failed`);
        client[operation].rejects(failure);

        await rejects(hre.tasks.getTask("omnibus:multi-test").run({ repo: "core" }), failure);
        assert.equal(stopNode.callCount, startedByUs ? 1 : 0);
      });
    }
  }

  it("rejects a missing mount directory before loading the omnibus or the node", async () => {
    const prepareNode = sinon.stub(multiTestDeps, "prepareLocalRpcNode").resolves({ client, startedByUs: true });
    sinon.stub(multiTestDeps, "pathExists").returns(false);

    await rejects(
      hre.tasks.getTask("omnibus:multi-test").run({ name: "fixture", repo: "core", mountTests: true }),
      /Mount directory mount\/core does not exist/,
    );

    sinon.assert.notCalled(load);
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
  let rename: sinon.SinonStub;
  let findContainer: sinon.SinonStub;
  let stopNode: sinon.SinonStub;
  let sleep: sinon.SinonStub;

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
    rename = sinon.stub(container, "rename").resolves();
    launch = sinon.stub(multiTestDeps, "runImageInBackground").resolves(container);
    findContainer = sinon.stub(multiTestDeps, "findContainerByName").resolves(null);
    stopNode = sinon.stub(multiTestDeps, "stopLocalRpcNode").resolves();
    sleep = sinon.stub(multiTestDeps, "sleep").resolves();
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
      sinon.assert.calledOnce(rename);
      sinon.assert.calledOnce(stop);
    });
  }

  it("propagates a startup failure without stopping a container it did not acquire", async () => {
    connect.onFirstCall().rejects(new Error("No existing node"));
    const failure = new Error("Container creation failed");
    launch.rejects(failure);
    await rejects(multiTestDeps.prepareLocalRpcNode("mainnet", 123n), failure);
    sinon.assert.notCalled(rename);
    sinon.assert.notCalled(stop);
  });

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

  it("keeps probing a starting node until it answers", async () => {
    multiTestDeps.localRpcNodeConnectTimeoutMs = 60_000;
    connect.onFirstCall().rejects(new Error("No existing node"));
    connect.onSecondCall().rejects(new Error("Node is still booting"));
    connect.onThirdCall().rejects(new Error("Node is still booting"));

    const node = await multiTestDeps.prepareLocalRpcNode("mainnet", 123n);

    assert.isTrue(node.startedByUs);
    assert.equal(connect.callCount, 4);
    sinon.assert.calledTwice(sleep);
    sinon.assert.notCalled(stop);
  });

  it("stops its own container when the started node never answers", async () => {
    connect.rejects(new Error("Node is unavailable"));

    await rejects(multiTestDeps.prepareLocalRpcNode("mainnet", 123n), /Node is unavailable/);

    sinon.assert.calledOnce(launch);
    sinon.assert.calledOnce(stop);
    sinon.assert.notCalled(sleep);
  });
});
