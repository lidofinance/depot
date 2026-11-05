import { assert } from "chai";
import hre from "hardhat";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { rejects } from "node:assert/strict";
import { pathToFileURL } from "node:url";
import sinon from "sinon";

import prompt from "@/src/common/prompt";
import { Omnibus } from "@/src/omnibuses";
import { RpcClient } from "@/src/network";
import { omnibusTaskDeps, prepareOmnibus } from "@/tasks/omnibuses";
import { lintVoteAddresses } from "@/src/omnibuses/address-lint";

describe("omnibus:create", () => {
  let name: string;
  let directory: string;
  let root: string;
  let omnibusesDir: string;

  async function createArchivedOmnibus(network: string) {
    const archive = path.join(omnibusesDir, "archive", network, name);
    await mkdir(archive, { recursive: true });
    return archive;
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "depot-omnibus-"));
    omnibusesDir = path.join(root, "omnibuses");
    await mkdir(omnibusesDir);
    await cp(path.resolve("omnibuses/_omnibus_template"), path.join(omnibusesDir, "_omnibus_template"), {
      recursive: true,
    });
    for (const folder of ["src", "abi", "node_modules"]) {
      await symlink(path.resolve(folder), path.join(root, folder), "dir");
    }
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    sinon.stub(omnibusTaskDeps, "getOmnibusesDir").returns(omnibusesDir);
    name = `2026_09_06_create_${randomUUID().replaceAll("-", "")}`;
    directory = path.join(omnibusesDir, "ongoing", "mainnet", name);
    sinon.stub(prompt, "text").resolves(name);
    sinon.stub(prompt, "confirm").resolves(false);
    sinon.stub(console, "log");
  });

  afterEach(async () => {
    sinon.restore();
    await rm(root, { recursive: true, force: true });
  });

  it("creates a loadable three-file Solidity scaffold", async () => {
    sinon.stub(prompt, "select").resolves("mainnet");
    await hre.tasks.getTask(["omnibus:create"]).run({});
    const contractName = `Omnibus_${name}`;
    assert.sameMembers(await readdir(directory), [`${name}.md`, `${name}.ts`, `${contractName}.sol`]);
    const [solidity, wrapper, markdown, templateMarkdown] = await Promise.all([
      readFile(path.join(directory, `${contractName}.sol`), "utf-8"),
      readFile(path.join(directory, `${name}.ts`), "utf-8"),
      readFile(path.join(directory, `${name}.md`), "utf-8"),
      readFile("omnibuses/_omnibus_template/_omnibus_template.md", "utf-8"),
    ]);

    assert.include(solidity, `contract ${contractName} is OmnibusBase`);
    assert.include(solidity, "address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;");
    assert.notInclude(solidity, "OmnibusTemplate");
    assert.notMatch(wrapper, /\bcalls\s*:/);
    assert.include(wrapper, "upgrade: false");
    assert.equal(markdown.slice(markdown.indexOf("\n")), templateMarkdown.slice(templateMarkdown.indexOf("\n")));
    assert.notInclude(markdown, "Omnibus Template");
    assert.isEmpty(lintVoteAddresses({ rootDir: root, directories: [directory] }));

    const { default: omnibus }: { default: unknown } = await import(
      pathToFileURL(path.join(directory, `${name}.ts`)).href
    );
    if (!(omnibus instanceof Omnibus)) {
      throw new Error("Generated wrapper must export an Omnibus");
    }
    assert.equal(omnibus.network, "mainnet");
    assert.isFalse(omnibus.hasDeployMethod());
    assert.isUndefined(omnibus.voteId);
  });

  it("does not recreate an archived name", async () => {
    sinon.stub(prompt, "select").resolves("mainnet");
    const archive = await createArchivedOmnibus("mainnet");
    await writeFile(path.join(archive, `${name}.md`), "Archived description");
    await rejects(hre.tasks.getTask(["omnibus:create"]).run({}), /already exists/);
    assert.equal(await readFile(path.join(archive, `${name}.md`), "utf-8"), "Archived description");
    await rejects(readdir(directory), { code: "ENOENT" });
  });

  it("rejects default discovery with several Solidity contracts", async () => {
    await mkdir(directory, { recursive: true });
    await Promise.all(
      ["First.sol", "Second.sol", "Ignored.t.sol"].map((file) => writeFile(path.join(directory, file), "")),
    );
    const omnibus = Omnibus.create({ network: "mainnet", upgrade: false, testVote: async () => {} });
    omnibus.setName(name);
    await rejects(
      prepareOmnibus(hre, sinon.createStubInstance(RpcClient), omnibus),
      /contains more than one Solidity contract/,
    );
  });

  it("rejects ambiguous archived directories", async () => {
    await Promise.all(["mainnet", "hoodi"].map(createArchivedOmnibus));
    const omnibus = Omnibus.create({ network: "mainnet", upgrade: false, testVote: async () => {} });
    omnibus.setName(name);
    await rejects(prepareOmnibus(hre, sinon.createStubInstance(RpcClient), omnibus), /several directories/);
  });
});
