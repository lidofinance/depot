import easyTrack from "./easy-track";
import events from "./events";
import stakingRouter from "./staking-router";
import tokens from "./tokens";
import { LidoContracts, LidoImpls, LidoProxies } from "../../contracts/contracts";
import { DevRpcClient } from "../../network";

export interface CheckContext {
  client: DevRpcClient;
  impls: LidoImpls;
  proxies: LidoProxies;
  contracts: LidoContracts;
}

export default {
  easyTrack,
  events,
  stakingRouter,
  tokens,
};
