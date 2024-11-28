import easyTrack from "./easy-track";
import events from "./events";
import stakingRouter from "./staking-router";
import tokens from "./tokens";
import { Contracts } from "../../contracts/contracts";
import { Lido } from "../../../configs/types";
import { JsonRpcProvider } from "ethers";

export interface CheckContext {
  contracts: Contracts<Lido>;
  provider: JsonRpcProvider;
}

export default {
  easyTrack,
  events,
  stakingRouter,
  tokens,
};
