import easyTrack from "./easy-track";
import stakingRouter from "./staking-router";
import tokens from "./tokens";
import accessControl from "./access-control";
import stakingModule from "./staking-module";
import hashConsensus from "./hash-consensus";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BindFirstParam<R extends Record<string, (...args: any[]) => any>> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof R]: R[K] extends (first: any, ...rest: infer Args) => infer Return ? (...args: Args) => Return : never;
};

export type Blueprints = {
  [K in keyof typeof blueprints]: BindFirstParam<(typeof blueprints)[K]>;
};

const blueprints = {
  easyTrack,
  stakingRouter,
  tokens,
  accessControl,
  stakingModule,
  hashConsensus,
};

export default blueprints;
