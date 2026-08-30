import { assert } from "chai";
import sinon from "sinon";

import type { DevRpcClient } from "../../src/network";
import { runRepositorySuites } from "../../tasks/omnibuses";

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

    await runRepositorySuites(createSnapshotClient(state), ["core", "dual-governance", "scripts"], (repository) => {
      observedStates.push([repository, state.value]);
      state.value = `${repository} mutation`;
      return Promise.resolve();
    });

    assert.deepEqual(observedStates, [
      ["core", "post-omnibus"],
      ["dual-governance", "post-omnibus"],
      ["scripts", "post-omnibus"],
    ]);
    assert.equal(state.value, "post-omnibus");
  });
});
