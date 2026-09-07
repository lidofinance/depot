import { assert } from "chai";
import sinon from "sinon";

import type { DevRpcClient } from "../../src/network";
import { getRepositorySuites, runRepositorySuites } from "../../tasks/omnibuses";
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
