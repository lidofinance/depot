import { assert } from "chai";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sinon from "sinon";

import { DevRpcClient } from "@/src/network";
import { Omnibus } from "@/src/omnibuses";
import { omnibusTaskBuilders, omnibusTaskDeps } from "@/tasks/omnibuses";
import { runAcceptance } from "@/tasks/sub-tasks/acceptance";

describe("omnibus:test acceptance option", () => {
  let hre: HardhatRuntimeEnvironment;
  let root: string;
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  before(async () => {
    hre = await createHardhatRuntimeEnvironment({ tasks: omnibusTaskBuilders.map((builder) => builder.build()) });
  });

  beforeEach(async () => {
    root = await mkdtemp(path.resolve("omnibuses/_acceptance_task_"));
    const directory = path.join(root, "fixture");
    await mkdir(directory);
    const module = path.relative(directory, path.resolve("src/omnibuses/omnibus"));
    await writeFile(
      path.join(directory, "fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", testVote: async () => {} });`,
    );
    await writeFile(path.join(directory, "fixture.md"), "");
    const snapshotDirectory = path.join(root, "snapshot_fixture");
    await mkdir(snapshotDirectory);
    await writeFile(
      path.join(snapshotDirectory, "snapshot_fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", upgradeSnapshot: { suites: ["voting"] }, testVote: async () => {} });`,
    );
    await writeFile(path.join(snapshotDirectory, "snapshot_fixture.md"), "");
    process.env = { ...originalEnv, ETH_MAINNET_RPC_URL: "http://localhost:18545" };
    globalThis.fetch = () => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 0, result: "0x1" }));
    sinon.stub(console, "log");
    sinon.stub(omnibusTaskDeps, "getOmnibusesDir").returns(root);
    sinon.stub(Omnibus.prototype, "hasDeployMethod").returns(true);
    sinon.stub(Omnibus.prototype, "getDeployment").returns({
      omnibus: Omnibus.deployedContract("0x0000000000000000000000000000000000000001"),
    });
    sinon.stub(Omnibus.prototype, "loadAndValidateOmnibusContractCalls").resolves();
    sinon.stub(Omnibus.prototype, "validateDgProposalDescriptions");
    sinon.stub(Omnibus.prototype, "getEvmScript").returns("0x00000001");
  });

  afterEach(async () => {
    sinon.restore();
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  });

  for (const skipAcceptance of [false, true]) {
    it(`forwards skipAcceptance=${skipAcceptance} from the registered task`, async () => {
      const test = sinon.stub(Omnibus.prototype, "test").resolves();

      await hre.tasks.getTask("omnibus:test").run({
        name: "fixture",
        ...(skipAcceptance ? { skipAcceptance: true } : {}),
      });

      sinon.assert.calledOnce(test);
      assert.instanceOf(test.firstCall.args[0], DevRpcClient);
      assert.strictEqual(test.firstCall.args[1], skipAcceptance ? undefined : runAcceptance);
    });

    it(`runs acceptance=${!skipAcceptance} once on a clean pass, separately from snapshot cases`, async () => {
      const test = sinon.stub(Omnibus.prototype, "test").resolves();
      const hooks = { beforeExecution: sinon.stub().resolves(), afterExecution: sinon.stub().resolves() };
      const runSnapshots = sinon
        .stub(omnibusTaskDeps, "runSnapshots")
        .callsFake(async (_client, _config, testUpgrade) => {
          await testUpgrade(hooks);
          await testUpgrade(hooks);
        });

      await hre.tasks.getTask("omnibus:test").run({
        name: "snapshot_fixture",
        ...(skipAcceptance ? { skipAcceptance: true } : {}),
      });

      sinon.assert.calledThrice(test);
      assert.deepEqual(test.firstCall.args.slice(1), [skipAcceptance ? undefined : runAcceptance]);
      for (const call of test.getCalls().slice(1)) {
        assert.deepEqual(call.args.slice(1), [undefined, hooks]);
      }
      sinon.assert.calledOnce(runSnapshots);
      assert.isTrue(test.firstCall.calledBefore(runSnapshots.firstCall));
      assert.deepEqual(runSnapshots.firstCall.args[1], { suites: ["voting"] });
      assert.deepEqual(runSnapshots.firstCall.args[3], { createsVote: true });
    });
  }
});
