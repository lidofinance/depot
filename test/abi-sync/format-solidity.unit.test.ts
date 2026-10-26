import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assert } from "chai";

const execFileAsync = promisify(execFile);
const moduleUrl = new URL("../../src/abi-sync/index.ts", import.meta.url).href;

describe("ABI Solidity formatter subprocess", () => {
  let bin: string;

  beforeEach(async () => {
    bin = await fs.mkdtemp(path.join(os.tmpdir(), "depot-forge-"));
  });

  afterEach(async () => {
    await fs.rm(bin, { recursive: true, force: true });
  });

  async function formatWith(script?: string): Promise<string> {
    if (script) {
      await fs.writeFile(path.join(bin, "forge"), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    }
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { deps } from ${JSON.stringify(moduleUrl)};
         try {
           const result = await deps.formatSolidity('interface IFixture {}\\n' + ' '.repeat(1024 * 1024));
           console.log('SUCCESS', result.length);
         } catch (error) { console.log('REJECTED', error.message); }`,
      ],
      { env: { PATH: bin, DOTENV_CONFIG_PATH: "/dev/null" }, timeout: 10_000 },
    );
    return stdout;
  }

  it("reports an early nonzero Forge exit without an unhandled stdin error", async () => {
    const output = await formatWith('printf "fixture startup failure\\n" >&2\nexit 7');

    assert.include(output, "REJECTED forge fmt failed");
    assert.include(output, "fixture startup failure");
  });

  it("rejects incomplete stdin transfer even when Forge exits successfully", async () => {
    const output = await formatWith("exit 0");

    assert.match(output, /REJECTED forge fmt failed.*(EPIPE|closed|destroyed)/);
  });

  it("accepts successful formatting after all input is consumed", async () => {
    const output = await formatWith("/bin/cat >/dev/null\nprintf 'interface IFixture {}\\n'");

    assert.include(output, "SUCCESS 22");
  });

  it("preserves the missing Forge diagnostic", async () => {
    const output = await formatWith();

    assert.include(output, "REJECTED forge fmt failed (Foundry must be installed)");
    assert.include(output, "ENOENT");
  });
});
