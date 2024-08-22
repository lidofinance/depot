import { RpcProvider } from "../../providers";
import Mocha from "mocha";
import { assert } from "../../common/assert";
import { JsonRpcProvider, Log } from "ethers";
import votes, { EventCheck } from "../../votes";
import { Omnibus } from "../omnibus";
import { NetworkName } from "../../networks";
import { Receipt } from "web3-types";

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

export const compareEvents = (expectedEvents: EventCheck[], receipt: Receipt) => {
  const foundSubsequence = votes.subsequence(receipt.logs as Log[], expectedEvents, 0);
  return expectedEvents.filter((_, i) => foundSubsequence[i] === -1);
};
