import { assert } from "chai";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sinon from "sinon";

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
    const directory = path.join(root, "ongoing", "mainnet", "fixture");
    await mkdir(directory, { recursive: true });
    const module = path.relative(directory, path.resolve("src/omnibuses/omnibus"));
    await writeFile(
      path.join(directory, "fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", upgrade: false, testVote: async () => {} });`,
    );
    await writeFile(path.join(directory, "fixture.md"), "");
    const snapshotDirectory = path.join(root, "ongoing", "mainnet", "snapshot_fixture");
    await mkdir(snapshotDirectory);
    await writeFile(
      path.join(snapshotDirectory, "snapshot_fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", upgrade: true, testVote: async () => {} });`,
    );
    await writeFile(path.join(snapshotDirectory, "snapshot_fixture.md"), "");
    process.env = { ...originalEnv, ETH_MAINNET_RPC_URL: "http://localhost:18545" };
    globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      const results: Record<string, unknown> = {
        web3_clientVersion: "HardhatNetwork/3.0.0/@nomicfoundation/edr",
        evm_revert: true,
      };
      const result = results[method] ?? "0x1";
      return Promise.resolve(Response.json({ jsonrpc: "2.0", id: 0, result }));
    };
    sinon.stub(console, "log");
    sinon.stub(omnibusTaskDeps, "getOmnibusesDir").returns(root);
    sinon.stub(omnibusTaskDeps, "assertNodeOnRealChain").resolves();
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

  it("skips snapshots without upgrade", async () => {
    sinon.stub(Omnibus.prototype, "test").resolves();
    const runSnapshots = sinon.stub(omnibusTaskDeps, "runSnapshots").resolves();

    await hre.tasks.getTask("omnibus:test").run({ name: "fixture" });

    sinon.assert.notCalled(runSnapshots);
  });

  it("runs acceptance once on a clean pass, separately from snapshot cases", async () => {
    const test = sinon.stub(Omnibus.prototype, "test").resolves("not-launched");
    const hooks = { beforeExecution: sinon.stub().resolves(), afterExecution: sinon.stub().resolves() };
    const runSnapshots = sinon.stub(omnibusTaskDeps, "runSnapshots").callsFake(async (_client, testUpgrade) => {
      await testUpgrade(hooks);
      await testUpgrade(hooks);
    });

    await hre.tasks.getTask("omnibus:test").run({ name: "snapshot_fixture" });

    assert.deepEqual(
      test.getCalls().map((call) => call.args.slice(1)),
      [[runAcceptance], [undefined, hooks], [undefined, hooks]],
    );
    sinon.assert.calledOnce(runSnapshots);
  });

  it("skips upgrade snapshots for a vote executed on chain", async () => {
    sinon.stub(Omnibus.prototype, "test").resolves("dg-pending");
    const runSnapshots = sinon.stub(omnibusTaskDeps, "runSnapshots").resolves();

    await hre.tasks.getTask("omnibus:test").run({ name: "snapshot_fixture" });

    sinon.assert.notCalled(runSnapshots);
  });
});
