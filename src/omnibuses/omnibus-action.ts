import { EventCheck, FormattedEvmCall } from "../votes";

import { OmnibusActionInput, OmnibusActionMeta } from "./omnibus-action-meta";

/**
 * The base class to implement omnibus item with single action
 */
export abstract class OmnibusAction<Input extends OmnibusActionInput> extends OmnibusActionMeta<Input> {
  /**
   * Returns the EVMScript call item
   */
  abstract getCall(): FormattedEvmCall;

  /**
   * Returns the list of event checks expected to be emitted during the action execution
   */
  abstract getEvents(): EventCheck[];
}

export type { OmnibusHookCtx } from "./omnibus-action-meta";
