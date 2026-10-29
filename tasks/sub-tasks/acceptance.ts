import Mocha from "mocha";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DevRpcClient } from "@/src/network";

const ACCEPTANCE_DIR = fileURLToPath(new URL("../../test/protocol/acceptance/", import.meta.url));
// Negative suites mutate fork state heavily and run last
const ACCEPTANCE_SUITES = [
  "locator.test.ts",
  "lido.test.ts",
  "staking-router.test.ts",
  "dsm.test.ts",
  "node-operators-registry.test.ts",
  "simple-dvt-module.test.ts",
  "accounting-oracle.test.ts",
  "veb-oracle.test.ts",
  "oracle-report-sanity-checker.test.ts",
  "oracle-daemon-config.test.ts",
  "withdrawal-queue.test.ts",
  "withdrawal-vault.test.ts",
  "burner.test.ts",
  "el-rewards-vault.test.ts",
  "top-up-gateway.test.ts",
  "consolidation.test.ts",
  "dual-governance.test.ts",
  "circuit-breaker.test.ts",
  "accounting-oracle-negative.test.ts",
  "veb-negative.test.ts",
  "withdrawals-negative.test.ts",
];

export async function runAcceptance(client: DevRpcClient): Promise<void> {
  const mocha = new Mocha({ timeout: 600_000, failZero: true });
  mocha.suite.ctx.client = client;
  const registered = new Set(ACCEPTANCE_SUITES);
  const unregistered = (await readdir(ACCEPTANCE_DIR)).filter(
    (fileName) => fileName.endsWith(".test.ts") && !registered.has(fileName),
  );
  if (unregistered.length > 0) {
    throw new Error(`Acceptance suites missing from ACCEPTANCE_SUITES: ${unregistered.join(", ")}`);
  }
  for (const suite of ACCEPTANCE_SUITES) {
    mocha.addFile(path.join(ACCEPTANCE_DIR, suite));
  }

  try {
    // Mocha supports esmDecorator, but its type declarations omit the options argument.
    const loadFilesAsync: (options: { esmDecorator: (url: URL) => URL }) => Promise<void> =
      mocha.loadFilesAsync.bind(mocha);
    await loadFilesAsync({
      esmDecorator: (url) => {
        url.searchParams.set("run", randomUUID());
        return url;
      },
    });
    await new Promise<void>((resolve, reject) => {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`Acceptance checks failed: ${failures}`));
        } else {
          resolve();
        }
      });
    });
  } finally {
    mocha.dispose();
  }
}
