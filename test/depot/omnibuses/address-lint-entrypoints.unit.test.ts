import { assert } from "chai";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import hre from "hardhat";

import { lintVoteAddresses } from "@/src/omnibuses/address-lint";

const ADDRESS = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";

describe("vote address lint entrypoints", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "depot-address-lint-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(file: string, source: string): void {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  }

  it("checks active votes and templates, excludes ABI/tests, and only checks the archive when selected", () => {
    write("omnibuses/_omnibus_template/_omnibus_template.ts", `const LDO = "${ADDRESS}"; call(LDO);`);
    write("omnibuses/example/example.ts", `call("${ADDRESS}");`);
    write("omnibuses/archive/mainnet/old/old.ts", `call("${ADDRESS}");`);
    write("omnibuses/_omnibus_template/template.abi.ts", `call("${ADDRESS}");`);
    write("omnibuses/_omnibus_template/Example.t.sol", "invalid source");
    write("omnibuses/_omnibus_template/test.test.ts", `call("${ADDRESS}");`);
    assert.deepEqual(
      lintVoteAddresses({ rootDir: root }).map(({ file }) => file),
      ["omnibuses/example/example.ts"],
    );
    assert.deepEqual(
      lintVoteAddresses({ rootDir: root, directories: ["omnibuses/archive/mainnet/old"] }).map(({ file }) => file),
      ["omnibuses/archive/mainnet/old/old.ts"],
    );
  });

  it("blocks omnibus:test before importing a vote or compiling/connecting to RPC", async () => {
    const directory = mkdtempSync(path.resolve("omnibuses/examples/_address_lint_"));
    const name = path.basename(directory);
    try {
      writeFileSync(path.join(directory, `${name}.ts`), `throw new Error("WRAPPER_IMPORTED");\ncall("${ADDRESS}");`);
      writeFileSync(
        path.join(directory, "Vote.sol"),
        `contract Vote { function run() external { call(${ADDRESS}); } }`,
      );
      let caught: unknown;
      try {
        await hre.tasks.getTask(["omnibus:test"]).run({ name });
      } catch (error) {
        caught = error;
      }
      assert.instanceOf(caught, Error);
      assert.include(String(caught), "named constant");
      assert.notInclude(String(caught), "WRAPPER_IMPORTED");
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
