import Mocha from "mocha";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DevRpcClient } from "@/src/network";
import { SNAPSHOT_SUITES, type UpgradeSnapshotConfig, type UpgradeSnapshotHooks } from "@/src/omnibuses/omnibus-types";
import type { SnapshotContext } from "@/test/protocol/helpers/snapshot";

const SNAPSHOT_DIR = fileURLToPath(new URL("../../test/protocol/snapshot/", import.meta.url));
const knownSuites = new Set<string>(SNAPSHOT_SUITES);

export interface SnapshotRunOptions {
  // True when the upgrade starts a new Aragon vote instead of executing a configured voteId
  createsVote: boolean;
}

export async function runSnapshots(
  client: DevRpcClient,
  config: UpgradeSnapshotConfig,
  testUpgrade: (hooks: UpgradeSnapshotHooks) => Promise<void>,
  { createsVote }: SnapshotRunOptions,
): Promise<void> {
  if (config.suites.length === 0 || new Set(config.suites).size !== config.suites.length) {
    throw new Error("Upgrade snapshots require a nonempty list of distinct suites");
  }
  for (const suite of config.suites) {
    if (!knownSuites.has(suite)) {
      throw new Error(`Unknown upgrade snapshot suite: ${suite}`);
    }
  }
  if (config.storage?.length && !config.suites.includes("first-slots")) {
    throw new Error("Selected snapshot storage requires the first-slots suite");
  }
  const checkedChanges = new Set<string>();
  let executed = 0;
  const snapshotContext: SnapshotContext = {
    client,
    config,
    createsVote,
    checkedChanges,
    testUpgrade: async (hooks) => {
      await testUpgrade(hooks);
      executed++;
    },
  };
  const mocha = new Mocha({ timeout: 600_000, failZero: true, bail: true });
  mocha.suite.ctx.snapshotContext = snapshotContext;
  for (const suite of config.suites) {
    mocha.addFile(path.join(SNAPSHOT_DIR, `${suite}.test.ts`));
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
            reject(new Error("Upgrade snapshot coverage incomplete: every selected case must execute its upgrade"));
          } else {
            resolve();
          }
        });
        runner.on("fail", (_test: Mocha.Test, error: Error) => {
          errors.push(error);
        });
      });
      const unobserved = Object.keys(config.expectedChanges ?? {}).filter((key) => !checkedChanges.has(key));
      if (unobserved.length > 0) {
        throw new Error(`Unobserved expected upgrade snapshot changes: ${unobserved.join(", ")}`);
      }
    });
  } finally {
    mocha.dispose();
  }
}
