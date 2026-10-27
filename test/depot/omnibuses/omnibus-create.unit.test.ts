import { assert } from "chai";
import hre from "hardhat";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { rejects } from "node:assert/strict";
import { pathToFileURL } from "node:url";
import sinon from "sinon";

import prompt from "../../../src/common/prompt";
import { Omnibus } from "../../../src/omnibuses";
import { RpcClient } from "../../../src/network";
import { loadOmnibus, omnibusTaskDeps, prepareOmnibus } from "../../../tasks/omnibuses";
import { lintVoteAddresses } from "../../../src/omnibuses/address-lint";

describe("omnibus:create", () => {
  let name: string;
  let directory: string;
  let root: string;
  let omnibusesDir: string;

  async function createArchivedOmnibus(network: string) {
    const archive = path.join(omnibusesDir, "_archive", network, name);
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
    directory = path.join(omnibusesDir, name);
    sinon.stub(prompt, "text").resolves(name);
    sinon.stub(console, "log");
  });

  afterEach(async () => {
    sinon.restore();
    await rm(root, { recursive: true, force: true });
  });

  it("archives a created wrapper and its sibling helper with loadable external imports", async () => {
    sinon.stub(prompt, "select").resolves("mainnet");
    await hre.tasks.getTask(["omnibus:create"]).run({});
    const wrapperPath = path.join(directory, `${name}.ts`);
    let source = await readFile(wrapperPath, "utf-8");
    source =
      `import { network } from "./helper";\n` +
      source
        .replace('network: "mainnet"', "network")
        .replace("voteId: undefined", "voteId: 1")
        .replace("launchedAt: undefined", "launchedAt: 1")
        .replace("quorumReached: undefined", "quorumReached: false");
    await writeFile(wrapperPath, source);
    await writeFile(
      path.join(directory, "helper.ts"),
      `import {
  MiniMeToken_ABI,
} from "../../abi/MiniMeToken.abi";
export const network = MiniMeToken_ABI.length ? "mainnet" : "hoodi";
export const text = "../../src/omnibuses";
`,
    );
    await hre.tasks.getTask(["omnibus:archive"]).run({ name });
    await rejects(readdir(directory), { code: "ENOENT" });
    const archive = path.join(omnibusesDir, "_archive/mainnet", name);
    const archivedWrapper = path.join(archive, `${name}.ts`);
    const wrapper = await readFile(archivedWrapper, "utf-8");
    assert.include(wrapper, 'from "./helper"');
    assert.include(wrapper, 'from "../../../../src/omnibuses"');
    const helper = await readFile(path.join(archive, "helper.ts"), "utf-8");
    assert.include(helper, 'from "../../../../abi/MiniMeToken.abi"');
    assert.include(helper, 'text = "../../src/omnibuses"');
    const omnibus = await loadOmnibus(name);
    assert.equal(omnibus.voteId, 1);
    assert.equal(omnibus.network, "mainnet");
    const options: ts.CompilerOptions = {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      noEmit: true,
    };
    const program = ts.createProgram([archivedWrapper], options);
    assert.isEmpty(
      ts
        .getPreEmitDiagnostics(program)
        .filter((diagnostic) => diagnostic.file?.fileName.startsWith(archive))
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    );
  });

  for (const [network, voting] of [
    ["mainnet", "0x2e59A20f205bB85a89C53f1936454680651E618e"],
    ["hoodi", "0x49B3512c44891bef83F8967d075121Bd1b07a01B"],
  ]) {
    it(`creates a loadable three-file Solidity scaffold for ${network}`, async () => {
      sinon.stub(prompt, "select").resolves(network);
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
      assert.include(solidity, `address public constant VOTING = ${voting};`);
      assert.notInclude(solidity, "OmnibusTemplate");
      assert.notMatch(wrapper, /\bcalls\s*:/);
      assert.equal(markdown.slice(markdown.indexOf("\n")), templateMarkdown.slice(templateMarkdown.indexOf("\n")));
      assert.notInclude(markdown, "Omnibus Template");
      assert.isEmpty(lintVoteAddresses({ rootDir: root, directories: [directory] }));

      const { default: omnibus }: { default: unknown } = await import(
        pathToFileURL(path.join(directory, `${name}.ts`)).href
      );
      if (!(omnibus instanceof Omnibus)) {
        throw new Error("Generated wrapper must export an Omnibus");
      }
      assert.equal(omnibus.network, network);
      assert.isFalse(omnibus.hasDeployMethod());
      assert.isUndefined(omnibus.voteId);
      assert.isUndefined(omnibus.launchedAt);
      assert.isUndefined(omnibus.executedAt);
      assert.isUndefined(omnibus.quorumReached);
    });
  }

  it("rejects an existing name without overwriting its files", async () => {
    sinon.stub(prompt, "select").resolves("mainnet");
    await hre.tasks.getTask(["omnibus:create"]).run({});
    const fileNames = await readdir(directory);
    const before = await Promise.all(fileNames.map((fileName) => readFile(path.join(directory, fileName), "utf-8")));

    let caught: unknown;
    try {
      await hre.tasks.getTask(["omnibus:create"]).run({});
    } catch (error) {
      caught = error;
    }
    assert.instanceOf(caught, Error);
    assert.include(String(caught), "already exist");
    assert.sameMembers(await readdir(directory), fileNames);
    assert.deepEqual(
      await Promise.all(fileNames.map((fileName) => readFile(path.join(directory, fileName), "utf-8"))),
      before,
    );
  });

  it("does not recreate an archived name", async () => {
    sinon.stub(prompt, "select").resolves("mainnet");
    const archive = await createArchivedOmnibus("mainnet");
    await writeFile(path.join(archive, `${name}.md`), "Archived description");
    await rejects(hre.tasks.getTask(["omnibus:create"]).run({}), /archived/);
    assert.equal(await readFile(path.join(archive, `${name}.md`), "utf-8"), "Archived description");
    await rejects(readdir(directory), { code: "ENOENT" });
  });

  for (const files of [[], ["First.sol", "Second.sol"]]) {
    it(`rejects default discovery with ${files.length} Solidity contracts`, async () => {
      await mkdir(directory);
      await Promise.all([...files, "Ignored.t.sol"].map((file) => writeFile(path.join(directory, file), "")));
      const omnibus = Omnibus.create({ network: "mainnet", testVote: async () => {} });
      omnibus.setName(name);
      await rejects(
        prepareOmnibus(hre, sinon.createStubInstance(RpcClient), omnibus),
        /has no Solidity contract|contains more than one Solidity contract/,
      );
    });
  }

  it("rejects ambiguous archived directories", async () => {
    await Promise.all(["mainnet", "hoodi"].map(createArchivedOmnibus));
    const omnibus = Omnibus.create({ network: "mainnet", testVote: async () => {} });
    omnibus.setName(name);
    await rejects(prepareOmnibus(hre, sinon.createStubInstance(RpcClient), omnibus), /archived for several networks/);
  });
});
