import { EventCheck, FormattedEvmCall, call, event } from "../../votes";

import { OmnibusAction } from "../omnibus-action";
import { Address } from "../../common/types";
import { OmnibusTestContext } from "../tools/test";
import { OmnibusActionInput } from "../omnibus-action-meta";
import { NetworkName } from "../../networks";
import { LidoEthContracts } from "../../lido";

interface RemovePaymentEvmScriptFactoriesInput extends OmnibusActionInput {
  name: string;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

interface RemoveEvmScriptFactoryInput extends OmnibusActionInput {
  factory: Address;
}

abstract class RemoveEvmScriptFactory<T extends RemoveEvmScriptFactoryInput> extends OmnibusAction<T> {
  getEVMCalls(): FormattedEvmCall[] {
    return [call(this.contracts.easyTrack.removeEVMScriptFactory, [this.input.factory])];
  }

  getExpectedEvents(): EventCheck[] {
    return [event(this.contracts.easyTrack, "EVMScriptFactoryRemoved", { args: [this.input.factory] })];
  }

  async after({ it, assert }: OmnibusTestContext): Promise<void> {
    const { factory } = this.input;
    it(`Validate EVM script factory ${factory} was removed`, async () => {
      const evmScriptFactories = await this.contracts.easyTrack.getEVMScriptFactories();
      assert.notIncludeMembers(evmScriptFactories, [factory]);
    });
  }
}

interface RemovePaymentEvmScriptFactoryInput extends RemoveEvmScriptFactoryInput {
  name: string;
}

class RemoveTopUpEvmScriptFactory extends RemoveEvmScriptFactory<RemovePaymentEvmScriptFactoryInput> {
  get title(): string {
    const { name, factory } = this.input;
    return `Remove "${name} Top Up EVM Script Factory" ${factory} from EasyTrack`;
  }
}

class RemoveAddEvmScriptFactory extends RemoveEvmScriptFactory<RemovePaymentEvmScriptFactoryInput> {
  get title(): string {
    const { name, factory } = this.input;
    return `Remove "${name} Add Recipient EVM Script Factory" ${factory} from EasyTrack`;
  }
}

class RemoveRemoveEvmScriptFactory extends RemoveEvmScriptFactory<RemovePaymentEvmScriptFactoryInput> {
  get title(): string {
    const { name, factory } = this.input;
    return `Remove "${name} Remove Recipient EVM Script Factory" ${factory} from EasyTrack`;
  }
}

export class RemovePaymentEvmScriptFactories extends OmnibusAction<RemovePaymentEvmScriptFactoriesInput> {
  private readonly _items: (RemoveTopUpEvmScriptFactory | RemoveAddEvmScriptFactory | RemoveRemoveEvmScriptFactory)[];

  constructor(input: RemovePaymentEvmScriptFactoriesInput) {
    super(input);
    this._items = [new RemoveTopUpEvmScriptFactory({ name: input.name, factory: input.factories.topUp })];
    if (input.factories.addRecipient) {
      this._items.push(new RemoveAddEvmScriptFactory({ name: input.name, factory: input.factories.addRecipient }));
    }
    if (input.factories.removeRecipient) {
      this._items.push(
        new RemoveRemoveEvmScriptFactory({
          name: input.name,
          factory: input.factories.removeRecipient,
        }),
      );
    }
  }

  get title() {
    return `Remove "${this.input.name}" payment EVM Script Factories`;
  }

  init(network: NetworkName, contracts: LidoEthContracts) {
    super.init(network, contracts);
    this._items.forEach((item) => item.init(network, contracts));
  }

  getEVMCalls(): FormattedEvmCall[] {
    return this._items.flatMap((item) => item.getEVMCalls());
  }

  getExpectedEvents(): EventCheck[] {
    return this._items.flatMap((item) => item.getExpectedEvents());
  }
}
