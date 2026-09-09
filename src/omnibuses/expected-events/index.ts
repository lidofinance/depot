import accessControl from "./access-control";
import agent from "./agent";
import dualGovernance from "./dual-governance";
import easyTrack from "./easy-track";
import finance from "./finance";
import hashConsensus from "./hash-consensus";
import proxy from "./proxy";
import stakingRouter from "./staking-router";

/** Domain events of common vote actions, for `VoteEvents.item(title, [...])`. */
export const expectedEvents = {
  accessControl,
  /** Agent forwards executed through AdminExecutor in a Dual Governance proposal. */
  agent,
  dualGovernance,
  easyTrack,
  finance,
  hashConsensus,
  proxy,
  stakingRouter,
};
