import { RpcProvider } from "../../providers";
import Mocha, { Suite, Test } from "mocha";
import chalk from "chalk";
import { assert } from "../../common/assert";
import providers from "../../providers/providers";
import { ContractTransactionReceipt, JsonRpcProvider, Log, TransactionReceipt } from "ethers";
import votes from "../../votes";
import { OmnibusAction } from "../omnibus-action";
import { Omnibus } from "../omnibus";
import { NetworkName } from "../../networks";

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

  // Make a snapshot of the current state of the blockchain
  const { snapshot } = providers.cheats(provider);
  const restorer = await snapshot();

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

  const launchSuite = Mocha.Suite.create(rootSuite, `Launching & executing the omnibus (voteId = ${omnibus.voteId})`);

  let enactReceipt: ContractTransactionReceipt | TransactionReceipt;

  if (omnibus.isLaunched) {
    launchSuite.addTest(
      new Test(`The omnibus already launched in voting ${omnibus.voteId}. Executing the vote...`, async () => {
        if (!omnibus.voteId) throw new Error(`voteId is not set`);
        enactReceipt = await votes.pass(provider, omnibus.voteId);
      }),
    );
  } else {
    launchSuite.addTest(
      new Test(`Adopting the vote with omnibus...`, async () => {
        enactReceipt = await votes
          .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
          .then((r) => r.enactReceipt);
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

      eventsValidateFromIndex = await createOmnibusItemTestSuite(
        voteItemsTestSuite,
        action,
        provider,
        voteItemIndex++,
        enactReceipt,
        eventsValidateFromIndex,
      );
    }
  });

  await new Promise((resolve, reject) => {
    mocha.run(async (failures) => {
      // Revert the blockchain state
      await restorer.revert();

      if (failures) reject("some tests failed");
      resolve("success");
    });
  });
};

async function createOmnibusItemTestSuite(
  parentSuite: Mocha.Suite,
  action: OmnibusAction<any>,
  provider: RpcProvider,
  voteItemIndex: number,
  enactReceipt: TransactionReceipt | ContractTransactionReceipt,
  eventsValidateFromIndex: number,
): Promise<number> {
  const actionTestsSuite = Mocha.Suite.create(parentSuite, `${++voteItemIndex}) ${action.title}`);
  const eventChecks = action.getExpectedEvents();
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

export async function validateVotingEvents(omnibus: Omnibus<any>, parentSuite: Suite) {
  let eventsValidateFromIndex = 0;
  let voteItemIndex = 0;

  for (let i = 0; i < omnibus.actions.length; ++i) {
    const action = omnibus.actions[i];
    eventsValidateFromIndex = await validateActionEventsSequence(
      parentSuite,
      action,
      voteItemIndex++,
      eventsValidateFromIndex,
    );
  }
}

export const enactOmnibus = async (omnibus: Omnibus<NetworkName>, provider: JsonRpcProvider) => {
  let enactReceipt: any;

  if (omnibus.isLaunched) {
    try {
      enactReceipt = await votes.pass(provider, omnibus.voteId!);
    } catch (e) {
      assert.fail(`Failed to pass the vote: ${e}`);
    }
  } else {
    try {
      enactReceipt = await votes
        .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
        .then((r) => r.enactReceipt);
    } catch (e) {
      assert.fail(`Failed to adopt the vote: ${e}`);
    }
  }

  return enactReceipt;
};

async function validateActionEventsSequence(
  parentSuite: Suite,
  action: OmnibusAction<any>,
  voteItemIndex: number,
  eventsValidateFromIndex: number,
): Promise<number> {
  const actionTestsSuite = Suite.create(parentSuite, `${++voteItemIndex}) ${action.title}`);
  const eventChecks = action.getExpectedEvents();
  const eventNames = eventChecks.map((e) => e.fragment.name).join(", ");

  actionTestsSuite.addTest(
    new Test(`Validate Events Sequence: [${eventNames}]`, () => {
      const enactReceipt = parentSuite.ctx.enactReceipt;
      const foundSubsequence = votes.subsequence(enactReceipt.logs as Log[], eventChecks, eventsValidateFromIndex);

      if (foundSubsequence.length === 0) {
        throw new Error(`Empty events group "${action.constructor.name}"`);
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

  return eventsValidateFromIndex;
}
