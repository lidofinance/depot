import Mocha from "mocha";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DevRpcClient } from "../../src/network";

export async function runAcceptance(client: DevRpcClient): Promise<void> {
  const mocha = new Mocha({ timeout: 600_000, failZero: true });
  mocha.suite.ctx.client = client;
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/locator.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/lido.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/staking-router.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/dsm.test.ts", import.meta.url)));
  mocha.addFile(
    fileURLToPath(new URL("../../test/protocol/acceptance/node-operators-registry.test.ts", import.meta.url)),
  );
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/simple-dvt-module.test.ts", import.meta.url)));

  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/accounting-oracle.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/veb-oracle.test.ts", import.meta.url)));
  mocha.addFile(
    fileURLToPath(new URL("../../test/protocol/acceptance/oracle-report-sanity-checker.test.ts", import.meta.url)),
  );
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/oracle-daemon-config.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/withdrawal-queue.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/withdrawal-vault.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/burner.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/el-rewards-vault.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/top-up-gateway.test.ts", import.meta.url)));
  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/consolidation.test.ts", import.meta.url)));

  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/dual-governance.test.ts", import.meta.url)));

  mocha.addFile(fileURLToPath(new URL("../../test/protocol/acceptance/circuit-breaker.test.ts", import.meta.url)));

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
