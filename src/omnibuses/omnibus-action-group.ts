import { OmnibusAction } from "./omnibus-action";
import { OmnibusActionInput, OmnibusActionMeta } from "./omnibus-action-meta";

/**
 * The base class to implement omnibus item contained of a series of actions
 */
export abstract class OmnibusActionGroup<Input extends OmnibusActionInput> extends OmnibusActionMeta<Input> {
  /**
   * The list of omnibus items to run during the omnibus execution
   */
  abstract get items(): OmnibusAction<any>[];
}
