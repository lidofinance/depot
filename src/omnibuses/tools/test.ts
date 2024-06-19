import { RpcProvider, SnapshotRestorer } from "../../providers";
import Mocha, { Test } from "mocha";
import chalk from "chalk";
import { assert } from "../../common/assert";
import providers from "../../providers/providers";
import { ContractTransactionReceipt, Log, TransactionReceipt } from "ethers";
import votes from "../../votes";
import { OmnibusItem } from "../omnibus-item";
import { Omnibus } from "../omnibus";

interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void;
}

export interface OmnibusBeforeContext {
  assert: typeof assert;
  provider: RpcProvider;
}

export interface OmnibusTestContext {
  it: MochaTest;
  assert: typeof assert;
  provider: RpcProvider;
}

export const testOmnibus = async (omnibus: Omnibus<any>, provider: RpcProvider) => {
  // preparing the mocha tests for omnibus
  const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });

  const rootSuite = Mocha.Suite.create(
    mocha.suite,
    chalk.bold(`Testing the Omnibus "${omnibus.name}" on ${omnibus.network} network`),
  );

  const preparationSuite = Mocha.Suite.create(rootSuite, `Running before hooks & checks for the omnibus`);

  for (let action of omnibus.actions) {
    const actionItemSuite = Mocha.Suite.create(preparationSuite, action.title);
    const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
      actionItemSuite.addTest(new Test(title, fn));
    };
    await action.before({ it, assert, provider });
  }

  const { snapshot } = providers.cheats(provider);
  let restorer: SnapshotRestorer | null = null;

  const launchSuite = Mocha.Suite.create(rootSuite, `Launching & executing the omnibus (voteId = ${omnibus.voteId})`);

  let enactReceipt: ContractTransactionReceipt | TransactionReceipt;

  if (omnibus.isLaunched) {
    launchSuite.addTest(
      new Test(`The omnibus already launched in voting ${omnibus.voteId}. Executing the vote...`, async () => {
        if (!omnibus.voteId) throw new Error(`voteId is not set`);
        enactReceipt = await votes.pass(provider, omnibus.voteId);
        restorer = await snapshot();
      }),
    );
  } else {
    launchSuite.addTest(
      new Test(`Adopting the vote with omnibus...`, async () => {
        enactReceipt = await votes
          .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
          .then((r) => r.enactReceipt);
        restorer = await snapshot();
      }),
    );
  }

  const voteItemsTestSuite = Mocha.Suite.create(rootSuite, `Validating the voting items`);
  launchSuite.afterAll(async () => {
    // testing the omnibus items one by one
    let eventsValidateFromIndex = 0;
    let voteItemIndex = 0;

    for (let i = 0; i < omnibus.actions.length; ++i) {
      const action = omnibus.actions[i];

      if (action instanceof OmnibusItem) {
        eventsValidateFromIndex = await createOmnibusItemTestSuite(
          voteItemsTestSuite,
          action,
          provider,
          voteItemIndex++,
          enactReceipt,
          eventsValidateFromIndex,
        );
      } else {
        const items = action.items;
        const itemGroupTestSuite = Mocha.Suite.create(voteItemsTestSuite, action.title);
        for (const item of items) {
          eventsValidateFromIndex = await createOmnibusItemTestSuite(
            voteItemsTestSuite,
            item,
            provider,
            voteItemIndex++,
            enactReceipt,
            eventsValidateFromIndex,
          );
        }
        const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
          itemGroupTestSuite.addTest(new Test(title, fn));
        };
        await action.after({ it, assert, provider });
      }
    }
  });

  await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures) reject("some tests failed");
      resolve("success");
    });
  });
};

async function createOmnibusItemTestSuite(
  parentSuite: Mocha.Suite,
  action: OmnibusItem<unknown>,
  provider: RpcProvider,
  voteItemIndex: number,
  enactReceipt: TransactionReceipt | ContractTransactionReceipt,
  eventsValidateFromIndex: number,
): Promise<number> {
  const actionTestsSuite = Mocha.Suite.create(parentSuite, `${++voteItemIndex}) ${action.title}`);
  const eventChecks = action.events;
  const eventNames = eventChecks.map((e) => e.fragment.name).join(", ");
  actionTestsSuite.addTest(
    new Test(`Validate Events Sequence: [${eventNames}]`, () => {
      const foundSubsequence = votes.subsequence(enactReceipt.logs as Log[], eventChecks, eventsValidateFromIndex);

      if (foundSubsequence.length === 0) {
        throw new Error(`Empty events group "${name}"`);
      }

      if (foundSubsequence[foundSubsequence.length - 1] !== -1) {
        eventsValidateFromIndex = foundSubsequence[foundSubsequence.length - 1];
      }

      for (let i = 0; i < foundSubsequence.length; ++i) {
        const index = foundSubsequence[i];
        if (index !== -1) continue;
        throw new Error(`Event not found ${eventChecks[i].fragment.name}`);
      }
    }),
  );

  // launch the omnibus item tests
  const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
    actionTestsSuite.addTest(new Test(title, fn));
  };
  await action.after({ it, assert, provider });
  return eventsValidateFromIndex;
}