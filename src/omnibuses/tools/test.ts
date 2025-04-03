import { assert } from "../../common/assert";
import { JsonRpcProvider } from "ethers";
import votes from "../../aragon-votes-tools";
import { Omnibus } from "../omnibuses";

export const enactOmnibus = async (omnibus: Omnibus, provider: JsonRpcProvider) => {
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
        .adopt(provider, omnibus.script, omnibus.summary, { gasLimit: 30_000_000 })
        .then((r) => r.enactReceipt);
    } catch (e) {
      assert.fail(`Failed to adopt the vote: ${e}`);
    }
  }

  return enactReceipt;
};
