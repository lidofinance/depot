import { call, event, EventCheck, FormattedEvmCall } from "../../votes";
import { AllowedRecipientsRegistry__factory } from "../../../typechain-types";
import bytes, { HexStrPrefixed } from "../../common/bytes";

import { OmnibusAction } from "../omnibus-action";
import { Address } from "../../common/types";
import { OmnibusActionInput } from "../omnibus-action-meta";
import { NetworkName } from "../../networks";
import { LidoEthContracts } from "../../lido";

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface();

interface AddPaymentEvmScriptFactoriesInput extends OmnibusActionInput {
  name: string;
  registry: Address;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
  token: Address;
  trustedCaller: Address;
}

interface AddEvmScriptFactoryInput extends OmnibusActionInput {
  factory: Address;
}

interface AddTopUpEvmScriptFactoryInput extends AddEvmScriptFactoryInput {
  name: string;
  token: Address;
  registry: Address;
  trustedCaller: Address;
}

interface RecipientEvmScriptFactoryInput extends AddEvmScriptFactoryInput {
  name: string;
  registry: Address;
  trustedCaller: Address;
}

abstract class AddEvmScriptFactory<T extends AddEvmScriptFactoryInput> extends OmnibusAction<T> {
  getEVMCalls(): FormattedEvmCall[] {
    const { easyTrack } = this.contracts;
    return [call(easyTrack.addEVMScriptFactory, [this.input.factory, this.permission])];
  }

  getExpectedEvents(): EventCheck[] {
    const { easyTrack } = this.contracts;
    const { factory } = this.input;
    return [event(easyTrack, "EVMScriptFactoryAdded", { args: [factory, this.permission] })];
  }

  protected abstract get permission(): HexStrPrefixed;
}

class AddTopUpEvmScriptFactory extends AddEvmScriptFactory<AddTopUpEvmScriptFactoryInput> {
  get title() {
    return `Add "${this.input.name} Top Up EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  protected get permission() {
    const { finance } = this.contracts;
    return bytes.join(
      // allow to call finance.newImmediatePayment()
      ...[finance.address, finance.newImmediatePayment.fragment.selector],
      // allow to call allowedRecipientsRegistry.updateSpentAmount()
      ...[this.input.registry, iAllowedRecipientsRegistry.getFunction("updateSpentAmount").selector],
    );
  }
}

class AddAddRecipientEvmScriptFactory extends OmnibusAction<RecipientEvmScriptFactoryInput> {
  get title() {
    return `Add "${this.input.name} Add Recipient EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  getEVMCalls(): FormattedEvmCall[] {
    const { easyTrack } = this.contracts;
    const { factory } = this.input;
    return [call(easyTrack.addEVMScriptFactory, [factory, this.permission])];
  }

  getExpectedEvents(): EventCheck[] {
    return [
      event(this.contracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [this.input.factory, this.permission],
      }),
    ];
  }

  private get permission() {
    return bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[this.input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
    );
  }
}

class AddRemoveRecipientEvmScriptFactory extends AddEvmScriptFactory<RecipientEvmScriptFactoryInput> {
  get title(): string {
    return `Add "${this.input.name} Remove Recipient EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  getExpectedEvents(): EventCheck[] {
    const { easyTrack } = this.contracts;
    return [
      event(easyTrack, "EVMScriptFactoryAdded", {
        args: [this.input.factory, this.permission],
      }),
    ];
  }

  protected get permission() {
    return bytes.join(
      // allow to call allowedRecipientsRegistry.removeRecipient()
      ...[this.input.registry, iAllowedRecipientsRegistry.getFunction("removeRecipient").selector],
    );
  }
}

export class AddPaymentEvmScriptFactories extends OmnibusAction<AddPaymentEvmScriptFactoriesInput> {
  private readonly _items: (
    | AddTopUpEvmScriptFactory
    | AddAddRecipientEvmScriptFactory
    | AddRemoveRecipientEvmScriptFactory
  )[];

  constructor(input: AddPaymentEvmScriptFactoriesInput) {
    super(input);
    this._items = [
      new AddTopUpEvmScriptFactory({
        name: input.name,
        token: input.token,
        registry: input.registry,
        factory: input.factories.topUp,
        trustedCaller: input.trustedCaller,
      }),
    ];
    if (input.factories.addRecipient) {
      this._items.push(
        new AddAddRecipientEvmScriptFactory({
          name: input.name,
          registry: input.registry,
          factory: input.factories.addRecipient,
          trustedCaller: input.trustedCaller,
        }),
      );
    }
    if (input.factories.removeRecipient) {
      this._items.push(
        new AddRemoveRecipientEvmScriptFactory({
          name: input.name,
          registry: input.registry,
          factory: input.factories.removeRecipient,
          trustedCaller: input.trustedCaller,
        }),
      );
    }
  }

  init(network: NetworkName, contracts: LidoEthContracts) {
    super.init(network, contracts);
    this._items.forEach((item) => item.init(network, contracts));
  }

  get title(): string {
    return `Add "${this.input.name}" payment EVM Script Factories`;
  }

  getEVMCalls(): FormattedEvmCall[] {
    return this._items.flatMap((item) => item.getEVMCalls());
  }

  getExpectedEvents(): EventCheck[] {
    return this._items.flatMap((item) => item.getExpectedEvents());
  }
}
