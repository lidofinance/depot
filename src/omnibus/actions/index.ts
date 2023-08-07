import { default as acl } from "./acl-actions";
import { default as agent } from "./agent-actions";
import { default as finance } from "./finance-actions";
import { default as easyTrack } from "./easy-track-actions";
import { default as nodeOperatorsRegistry } from "./node-operators-registry-actions";

const actions = {
  acl,
  agent,
  finance,
  easyTrack,
  nodeOperatorsRegistry,
};

export type Actions = typeof actions;

export default actions;
