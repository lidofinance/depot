import { EventCheck, FormattedEvmCall } from "../votes";

import { OmnibusActionInput, OmnibusActionMeta } from "./omnibus-action-meta";
import { ActionTestContext } from "../testing/contracts";

/**
 * The base class to implement omnibus item with single action
 */
export abstract class OmnibusAction<Input extends OmnibusActionInput> extends OmnibusActionMeta<Input> {
  /**
   * Returns the EVMScript call item
   */
  abstract getEVMCalls(): FormattedEvmCall[];

  /**
   * Returns the list of event checks expected to be emitted during the action execution
   */
  abstract getExpectedEvents(): EventCheck[];

  abstract getTestContext(): Promise<ActionTestContext>;
}

export type { OmnibusHookCtx } from "./omnibus-action-meta";
