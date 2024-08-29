import { RpcProvider } from "../../providers";
import Mocha from "mocha";
import { assert } from "../../common/assert";
import { JsonRpcProvider } from "ethers";
import votes from "../../votes";
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
