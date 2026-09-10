import Docker from "dockerode";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { rejects } from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import sinon from "sinon";

import { runTestsFromRepo } from "../../src/docker";

describe("repository suite exit codes", () => {
  const originalCwd = process.cwd();
  let fixtureDir: string;
  let run: sinon.SinonStub<Parameters<Docker["run"]>, ReturnType<Docker["run"]>>;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "depot-suite-exit-"));
    process.chdir(fixtureDir);
    // summarizeLog reads the log the container would have written
    await mkdir(path.join(fixtureDir, "logs"), { recursive: true });
    await writeFile(path.join(fixtureDir, "logs", "lido-core.log"), "  1 passing\n");
    sinon.stub(console, "log");
    sinon.stub(Docker.prototype, "listContainers").resolves([]);
    run = sinon.stub(Docker.prototype, "run");
  });

  afterEach(async () => {
    sinon.restore();
    process.chdir(originalCwd);
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it("fails a suite container killed with SIGTERM instead of reporting it as passed", async () => {
    run.resolves([{ StatusCode: 143 }, new Docker().getContainer("lido-core"), "lido-core", {}]);

    await rejects(
      runTestsFromRepo("core", "depot/core:pinned", ["npm", "test"], {}),
      /Container lido-core exited with status code 143/,
    );
  });

  it("accepts only a zero exit code", async () => {
    run.resolves([{ StatusCode: 0 }, new Docker().getContainer("lido-core"), "lido-core", {}]);

    await runTestsFromRepo("core", "depot/core:pinned", ["npm", "test"], {});

    sinon.assert.calledOnce(run);
  });
});
