import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";
import { call, event } from "../../votes";

interface RemovePaymentEvmScriptFactoriesInput {
  name: string;
  factories: {
    topUp: Address;
    addRecipient?: Address;
    removeRecipient?: Address;
  };
}

export class RemovePaymentEvmScriptFactories extends OmnibusAction<RemovePaymentEvmScriptFactoriesInput> {
  private get name() {
    return this.input.name;
  }
  private get topUp() {
    return this.input.factories.topUp;
  }

  private get addRecipient() {
    return this.input.factories.addRecipient;
  }

  private get removeRecipient() {
    return this.input.factories.removeRecipient;
  }

  private get topUpTitle() {
    return `Remove "${this.name}" top up EVM script factory ${this.topUp} from EasyTrack`;
  }

  private get addRecipientTitle() {
    return `Remove "${this.name}" add recipient EVM script factory ${this.addRecipient} from EasyTrack`;
  }

  private get removeRecipientTitle() {
    return `Remove "${this.name}" remove recipient EVM script factory ${this.removeRecipient} from EasyTrack`;
  }

  calls(): TitledEvmCall[] {
    const { easyTrack } = this.contracts;
    const { topUp, addRecipient, removeRecipient } = this;
    const { topUpTitle, addRecipientTitle, removeRecipientTitle } = this;

    const res: TitledEvmCall[] = [[topUpTitle, call(easyTrack.removeEVMScriptFactory, [topUp])]];

    if (addRecipient) {
      res.push([addRecipientTitle, call(easyTrack.removeEVMScriptFactory, [addRecipient])]);
    }

    if (removeRecipient) {
      res.push([removeRecipientTitle, call(easyTrack.removeEVMScriptFactory, [removeRecipient])]);
    }

    return res;
  }

  events(): TitledEventChecks[] {
    const { easyTrack } = this.contracts;
    const { topUp, addRecipient, removeRecipient } = this;
    const { topUpTitle, addRecipientTitle, removeRecipientTitle } = this;

    const res: TitledEventChecks[] = [
      [topUpTitle, event(easyTrack, "EVMScriptFactoryRemoved", { args: [topUp] })],
    ];

    if (addRecipient) {
      res.push([
        addRecipientTitle,
        event(easyTrack, "EVMScriptFactoryRemoved", { args: [addRecipient] }),
      ]);
    }

    if (removeRecipient) {
      res.push([
        removeRecipientTitle,
        event(easyTrack, "EVMScriptFactoryRemoved", { args: [removeRecipient] }),
      ]);
    }
    return res;
  }

  async test({ it, assert }: OmnibusTestContext): Promise<void> {
    const { easyTrack } = this.contracts;
    const { topUp, addRecipient, removeRecipient } = this;

    const evmScriptFactories = await easyTrack.getEVMScriptFactories();

    it(`Validate top up evm script factory ${topUp} was removed`, async () => {
      assert.notIncludeMembers(evmScriptFactories, [topUp]);
    });

    if (addRecipient) {
      it(`Validate add recipient evm script factory ${addRecipient} was removed`, async () => {
        assert.notIncludeMembers(evmScriptFactories, [addRecipient]);
      });
    }

    if (removeRecipient) {
      it(`Validate remove recipient evm script factory ${removeRecipient} was removed`, async () => {
        assert.notIncludeMembers(evmScriptFactories, [removeRecipient]);
      });
    }
  }
}
