import { assert } from "chai";
import hre from "hardhat";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sinon from "sinon";

import prompt from "../../src/common/prompt";
import { Omnibus } from "../../src/omnibuses";
import { lintVoteAddresses } from "../../src/omnibuses/address-lint";

describe("omnibus:create", () => {
  let name: string;
  let directory: string;

  beforeEach(() => {
    name = `2026_09_06_create_${randomUUID().replaceAll("-", "")}`;
    directory = path.resolve("omnibuses", name);
    sinon.stub(prompt, "text").resolves(name);
    sinon.stub(console, "log");
  });

  afterEach(async () => {
    sinon.restore();
    await rm(directory, { recursive: true, force: true });
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
      assert.isEmpty(lintVoteAddresses({ directories: [directory] }));

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
});
