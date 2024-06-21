import { EventCheck, FormattedEvmCall } from "../votes";

import { OmnibusActionInput, OmnibusItemMeta } from "./omnibus-item-meta";

/**
 * The base class to implement omnibus item with single action
 */
export abstract class OmnibusItem<Input extends OmnibusActionInput = never> extends OmnibusItemMeta<Input> {
  /**
   * Returns the EVMScript call item
   */
  abstract get call(): FormattedEvmCall;

  /**
   * Returns the list of event checks expected to be emitted during the action execution
   */
  abstract get events(): EventCheck[];
}

export type { OmnibusHookCtx } from "./omnibus-item-meta";
