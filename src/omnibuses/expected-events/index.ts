import accessControl from "./access-control";
import allowedRecipients from "./allowed-recipients";
import easyTrack from "./easy-track";
import finance from "./finance";
import hashConsensus from "./hash-consensus";
import nodeOperators from "./node-operators";
import proxy from "./proxy";
import stakingRouter from "./staking-router";

/** Domain events of common vote actions, for `VoteEvents.item(title, [...])`. */
export const expectedEvents = {
  accessControl,
  allowedRecipients,
  easyTrack,
  finance,
  hashConsensus,
  nodeOperators,
  proxy,
  stakingRouter,
};
