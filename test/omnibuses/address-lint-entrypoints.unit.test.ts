import { assert } from "chai";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import hre from "hardhat";

import { lintVoteAddresses } from "../../src/omnibuses/address-lint";

const ADDRESS = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const CLI = path.resolve("scripts/lint-vote-addresses.ts");
const TSX = path.resolve("node_modules/tsx/dist/loader.mjs");

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

  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  }

  it("checks active votes and templates, excludes ABI/tests, and only checks the archive when selected", () => {
    write("omnibuses/_omnibus_template/_omnibus_template.ts", `const LDO = "${ADDRESS}"; call(LDO);`);
    write("omnibuses/example/example.ts", `call("${ADDRESS}");`);
    write("omnibuses/_archive/mainnet/old/old.ts", `call("${ADDRESS}");`);
    write("omnibuses/_omnibus_template/template.abi.ts", `call("${ADDRESS}");`);
    write("omnibuses/_omnibus_template/Example.t.sol", "invalid source");
    write("omnibuses/_omnibus_template/test.test.ts", `call("${ADDRESS}");`);
    assert.deepEqual(
      lintVoteAddresses({ rootDir: root }).map(({ file }) => file),
      ["omnibuses/example/example.ts"],
    );
    assert.deepEqual(
      lintVoteAddresses({ rootDir: root, directories: ["omnibuses/_archive/mainnet/old"] }).map(({ file }) => file),
      ["omnibuses/_archive/mainnet/old/old.ts"],
    );
  });

  it("uses the index for both vote sources and imported dependencies without changing it", () => {
    git("init", "-q");
    write("shared.ts", `export const LDO = "${ADDRESS}";`);
    write("omnibuses/example/example.ts", `import { LDO } from "../../shared"; call(LDO);`);
    git("add", ".");
    const indexBefore = readFileSync(path.join(root, ".git/index"));
    write("shared.ts", "export const LDO = 1;");
    assert.isEmpty(lintVoteAddresses({ rootDir: root }));
    assert.isNotEmpty(lintVoteAddresses({ rootDir: root, staged: true }));
    assert.deepEqual(readFileSync(path.join(root, ".git/index")), indexBefore);
    git("add", "shared.ts");
    write("omnibuses/example/example.ts", `call("${ADDRESS}");`);
    assert.isEmpty(lintVoteAddresses({ rootDir: root, staged: true }));
    assert.isNotEmpty(lintVoteAddresses({ rootDir: root }));
  });

  it("runs the same staged checker from the pre-commit CLI with actionable diagnostics", () => {
    git("init", "-q");
    write("omnibuses/example/example.ts", `call(\n"${ADDRESS}");`);
    git("add", ".");
    const result = spawnSync(process.execPath, ["--import", TSX, CLI, "--staged"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.include(result.stderr, "omnibuses/example/example.ts:2:1:");
    write("package.json", JSON.stringify({ scripts: { "lint:vote-addresses": `node --import '${TSX}' '${CLI}'` } }));
    write("bin/npx", "#!/bin/sh\ntouch lint-staged-ran\n");
    chmodSync(path.join(root, "bin/npx"), 0o755);
    const hook = spawnSync("sh", ["-e", path.resolve(".husky/pre-commit")], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH ?? ""}` },
    });
    assert.equal(hook.status, 1);
    assert.include(hook.stderr, "omnibuses/example/example.ts:2:1:");
    assert.isFalse(existsSync(path.join(root, "lint-staged-ran")));
  });

  for (const task of ["omnibus:test", "omnibus:build"]) {
    it(`blocks ${task} before importing a vote or compiling/connecting to RPC`, async () => {
      const directory = mkdtempSync(path.resolve("omnibuses/_address_lint_"));
      const name = path.basename(directory);
      try {
        writeFileSync(path.join(directory, `${name}.ts`), `throw new Error("WRAPPER_IMPORTED");\ncall("${ADDRESS}");`);
        writeFileSync(
          path.join(directory, "Vote.sol"),
          `contract Vote { function run() external { call(${ADDRESS}); } }`,
        );
        let caught: unknown;
        try {
          await hre.tasks.getTask([task]).run({ name, ...(task === "omnibus:test" ? { forkBlock: "" } : {}) });
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
  }
});
