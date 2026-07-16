import accessControl from "./access-control";
import easyTrack from "./easy-track";
import stakingRouter from "./staking-router";
import tokens from "./tokens";
import { DevRpcClient } from "../../network";

export interface CheckContext {
  client: DevRpcClient;
}

export default {
  accessControl,
  easyTrack,
  stakingRouter,
  tokens,
};
