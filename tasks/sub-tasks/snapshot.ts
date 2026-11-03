import Mocha from "mocha";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactError } from "@/src/common/redact";
import type { DevRpcClient } from "@/src/network";
import type { UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";
import type { SnapshotContext } from "@/test/protocol/helpers/snapshot";

const SNAPSHOT_DIR = fileURLToPath(new URL("../../test/protocol/snapshot/", import.meta.url));

export interface SnapshotRunOptions {
  // True when the upgrade starts a new Aragon vote instead of executing a configured voteId
  createsVote: boolean;
  // Test seam: suite file names without `.test.ts`; omnibus:test always runs every suite
  suites?: readonly string[];
}

export async function runSnapshots(
  client: DevRpcClient,
  testUpgrade: (hooks: UpgradeSnapshotHooks) => Promise<void>,
  { createsVote, suites }: SnapshotRunOptions,
): Promise<void> {
  const network = client.getNetworkName();
  // Suites hold mainnet and Hoodi expectations only
  if (network !== "mainnet" && network !== "hoodi") {
    throw new Error(`Upgrade snapshots are not configured for ${network}`);
  }
  const files =
    suites?.map((suite) => `${suite}.test.ts`) ??
    (await readdir(SNAPSHOT_DIR)).filter((fileName) => fileName.endsWith(".test.ts")).sort();
  let executed = 0;
  const snapshotContext: SnapshotContext = {
    client,
    network,
    createsVote,
    testUpgrade: async (hooks) => {
      await testUpgrade(hooks);
      executed++;
    },
  };
  const mocha = new Mocha({ timeout: 600_000, failZero: true, bail: true });
  mocha.suite.ctx.snapshotContext = snapshotContext;
  for (const fileName of files) {
    mocha.addFile(path.join(SNAPSHOT_DIR, fileName));
  }
  try {
    await client.withSnapshot(async () => {
      const loadFilesAsync: (options: { esmDecorator: (url: URL) => URL }) => Promise<void> =
        mocha.loadFilesAsync.bind(mocha);
      await loadFilesAsync({
        esmDecorator: (url) => {
          url.searchParams.set("run", randomUUID());
          return url;
        },
      });
      await new Promise<void>((resolve, reject) => {
        const errors: Error[] = [];
        const runner = mocha.run((failures) => {
          if (failures > 0) {
            reject(new AggregateError(errors, `Upgrade snapshot checks failed: ${failures}`));
          } else if (!runner.stats || runner.stats.pending > 0 || executed === 0 || executed !== runner.stats.passes) {
            reject(new Error("Upgrade snapshot coverage incomplete: every case must execute its upgrade"));
          } else {
            resolve();
          }
        });
        // the reporter prints the errors after the run, and a forking node puts its RPC URL into them
        runner.on("fail", (_test: Mocha.Test, error: Error) => {
          errors.push(redactError(error));
        });
      });
    });
  } finally {
    mocha.dispose();
  }
}
