import accessControl from "./access-control";
import easyTrack from "./easy-track";
import hashConsensus from "./hash-consensus";
import nodeOperators from "./node-operators";
import proxy from "./proxy";
import stakingRouter from "./staking-router";

/** Domain events of common vote actions, for `VoteEvents.item(title, [...])`. */
export const expectedEvents = { accessControl, easyTrack, hashConsensus, nodeOperators, proxy, stakingRouter };
