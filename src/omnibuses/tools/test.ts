import { RpcProvider } from "../../providers";
import Mocha, { Suite, Test } from "mocha";
import { assert } from "../../common/assert";
import { JsonRpcProvider, Log } from "ethers";
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

export const validateVotingEvents = async (omnibus: Omnibus<any>, parentSuite: Suite) => {
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
};

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

const validateActionEventsSequence = async (
  parentSuite: Suite,
  action: OmnibusAction<any>,
  voteItemIndex: number,
  eventsValidateFromIndex: number,
): Promise<number> => {
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
};
