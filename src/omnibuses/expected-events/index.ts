import accessControl from "./access-control";
import agent from "./agent";
import allowedRecipients from "./allowed-recipients";
import dualGovernance from "./dual-governance";
import easyTrack from "./easy-track";
import finance from "./finance";
import hashConsensus from "./hash-consensus";
import kernel from "./kernel";
import nodeOperators from "./node-operators";
import proxy from "./proxy";
import stakingRouter from "./staking-router";

/** Domain events of common vote actions, for `VoteEvents.item(title, [...])`. */
export const expectedEvents = {
  accessControl,
  agent,
  allowedRecipients,
  dualGovernance,
  easyTrack,
  finance,
  hashConsensus,
  kernel,
  nodeOperators,
  proxy,
  stakingRouter,
};
