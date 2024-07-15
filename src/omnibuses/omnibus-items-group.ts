import { OmnibusItem } from "./omnibus-item";
import { OmnibusActionInput, OmnibusItemMeta } from "./omnibus-item-meta";

/**
 * The base class to implement omnibus item contained of a series of actions
 */
export abstract class OmnibusItemsGroup<Input extends OmnibusActionInput> extends OmnibusItemMeta<Input> {
  /**
   * The list of omnibus items to run during the omnibus execution
   */
  abstract get items(): OmnibusItem<any>[];
}
