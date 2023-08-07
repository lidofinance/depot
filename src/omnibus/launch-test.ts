import Mocha from "mocha";
import { assert } from "chai";
import { JsonRpcProvider, ContractTransactionReceipt, Log, EventLog } from "ethers";

import { EventInfo, EventsInfoBuilder } from "./types";
import checks, { EventsChecks } from "./event-checks";
import { LidoVersion, LidoProtocol } from "../lido";
import { LocalProvider, SnapshotRestorer, StaticProvider } from "../providers";
import { Omnibus } from "./omnibus";
import chalk from "chalk";
import providers from "../providers";
import lido from "../lido";
import { passVote, startVote } from "../../test/helpers/_voting";

interface SnapshotCtx<T extends LidoVersion> {
  assert: typeof assert;
  network: NetworkName;
  provider: LocalProvider<StaticProvider<JsonRpcProvider>>;
  proxies: ReturnType<LidoProtocol[T]>["proxies"];
  addresses: ReturnType<LidoProtocol[T]>["addresses"];
  contracts: ReturnType<LidoProtocol[T]>["contracts"];
  implementations: ReturnType<LidoProtocol[T]>["implementations"];
}

interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void;
}

interface Snapshots<T> {
  before: T;
  after: T;
}

interface TestsCtx<T, LV extends LidoVersion> extends SnapshotCtx<LV> {
  snapshots: Snapshots<T>;
}

interface OmnibusTestConfig<T, LV extends LidoVersion> {
  snapshot: (ctx: SnapshotCtx<LV>) => Promise<T>;
  events: (checks: EventsChecks, ctx: SnapshotCtx<LV>) => Promise<EventsInfoBuilder[]>;
  tests: (test: MochaTest, ctx: TestsCtx<T, LV>) => void;
}

export function OmnibusLaunchTest<T, LV extends LidoVersion>(config: OmnibusTestConfig<T, LV>) {
  return async (omnibus: Omnibus<LV>) => {
    const Test = Mocha.Test;

    const mocha = new Mocha({
      timeout: 20_0000,
    });

    const suite = (suiteName = "Suite Name", parentSuite = mocha.suite) =>
      Mocha.Suite.create(parentSuite, suiteName);

    const omnibusName = omnibus.launchDate.toISOString().split("T")[0];

    const parentSuite = suite(chalk.bold(`Testing the Omnibus ${chalk.blueBright(omnibusName)}`));
    const eventsSuite = suite("Emitted Events Tests", parentSuite);
    const testsSuite = suite("Acceptance Tests", parentSuite);

    let snapshotRestorer: SnapshotRestorer;
    let enactReceipt: ContractTransactionReceipt;
    const provider = providers.create(omnibus.network, { fork: true });
    const { addresses, contracts, implementations, proxies } = lido[omnibus.version](provider);
    const ctx: SnapshotCtx<LidoVersion> = {
      assert,
      proxies,
      provider,
      contracts,
      addresses,
      implementations,
      network: omnibus.network,
    };
    const testsCtx: TestsCtx<T, LidoVersion> = {
      ...ctx,
      snapshots: {} as Snapshots<T>,
    };

    parentSuite.beforeAll("Prepare the test snapshots & launch omnibus", async () => {
      snapshotRestorer = await provider.snapshot();
      const snapshotBefore = await config.snapshot(ctx);

      const [voteId] = await startVote(provider, omnibus.prepareEVMScript());
      enactReceipt = await passVote(provider, voteId);

      const snapshotAfter = await config.snapshot(ctx);
      testsCtx.snapshots = { before: snapshotBefore, after: snapshotAfter };
      await config.tests(it, testsCtx);
    });

    parentSuite.afterAll("Restore blockchain state", async () => {
      await provider.revert(snapshotRestorer.snapshotId);
    });

    let votingItemsGroups: (Log | EventLog)[][];
    let serviceEventsGroup: (Log | EventLog)[];
    let expectedEventsGroups: EventInfo[][];
    eventsSuite.beforeAll(async () => {
      const eventGroups = groupByLogs(
        enactReceipt.logs,
        (log) =>
          log.address === ctx.addresses.voting &&
          (log.topics[0] ===
            ctx.contracts.callsScript.interface.getEvent("LogScriptCall").topicHash ||
            log.topics[0] === ctx.contracts.voting.interface.getEvent("ScriptResult").topicHash),
      );
      votingItemsGroups = eventGroups.slice(0, eventGroups.length - 1);
      serviceEventsGroup = eventGroups[eventGroups.length - 1];
      expectedEventsGroups = await config.events(checks, ctx).then((builders) =>
        builders.map((b) =>
          b({
            proxies: ctx.proxies,
            addresses: ctx.addresses,
            contracts: ctx.contracts,
            implementations: ctx.implementations,
          }),
        ),
      );
    });

    eventsSuite.addTest(
      new Test("Executed correct number of voting items", () => {
        assert.equal(votingItemsGroups.length, expectedEventsGroups.length);
      }),
    );
    const titles = omnibus.titles;
    for (let i = 0; i < titles.length; ++i) {
      eventsSuite.addTest(
        new Test(titles[i], function () {
          if (!expectedEventsGroups[i] || !votingItemsGroups[i]) {
            this.skip();
          }
          _validateVotingEvents(expectedEventsGroups[i], votingItemsGroups[i]);
        } as Mocha.Func),
      );
    }

    const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
      testsSuite.addTest(new Test(title, fn));
    };

    const runMochaTests = () => {
      return new Promise((resolve, reject) => {
        mocha.run((failures) => {
          if (failures) reject("some tests failed");
          resolve("success");
        });
      });
    };

    return runMochaTests();
  };
}

function groupByLogs(logs: (Log | EventLog)[], predicate: (log: Log | EventLog) => boolean) {
  const res: (Log | EventLog)[][] = [];

  for (const log of logs) {
    if (predicate(log) || res.length === 0) {
      res.push([]);
    }
    res[res.length - 1].push(log);
  }
  return res;
}

function _validateVotingEvents(canonicalEventsChain: EventInfo[], eventsChain: Log[]) {
  if (canonicalEventsChain.length !== eventsChain.length) {
    throw new Error("Invalid events length");
  }
  for (let i = 0; i < canonicalEventsChain.length; ++i) {
    assert.equal(canonicalEventsChain[i].address, eventsChain[i].address);
    assert.equal(canonicalEventsChain[i].fragment.topicHash, eventsChain[i].topics[0]);
    if (canonicalEventsChain[i].args) {
      // TODO: assert parameters there
    }
  }
}
