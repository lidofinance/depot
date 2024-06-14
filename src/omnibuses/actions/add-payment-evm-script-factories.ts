import { AbiCoder } from "ethers";
import { EventCheck, FormattedEvmCall, call, event } from "../../votes";
import { AllowedRecipientsRegistry__factory, ERC20__factory } from "../../../typechain-types";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import providers from "../../providers";

import { OmnibusItem, OmnibusHookCtx } from "../omnibus-item";
import { OmnibusItemsGroup } from "../omnibus-items-group";
interface AddPaymentEvmScriptFactoriesInput {
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
const DEFAULT_ENACTOR: Address = "0xEE00eE11EE22ee33eE44ee55ee66Ee77EE88ee99";
const TEST_RECIPIENT = "0x0102030405060708091011121314151617181920";

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface();

interface AddEvmScriptFactoryInput {
  factory: Address;
}

abstract class AddEvmScriptFactory<T extends AddEvmScriptFactoryInput> extends OmnibusItem<T> {
  get call() {
    const { easyTrack } = this.contracts;
    return call(easyTrack.addEVMScriptFactory, [this.input.factory, this.permission]);
  }

  get events(): EventCheck[] {
    const { easyTrack } = this.contracts;
    const { factory } = this.input;
    return [event(easyTrack, "EVMScriptFactoryAdded", { args: [factory, this.permission] })];
  }

  async after({ it, assert }: OmnibusHookCtx) {
    it("Validate top up evm script factory was added", async () => {
      assert.includeMembers(await this.contracts.easyTrack.getEVMScriptFactories(), [this.input.factory]);
    });
  }

  protected abstract get permission(): HexStrPrefixed;
}

interface AddTopUpEvmScriptFactoryInput extends AddEvmScriptFactoryInput {
  name: string;
  token: Address;
  registry: Address;
  trustedCaller: Address;
}

class AddTopUpEvmScriptFactory extends AddEvmScriptFactory<AddTopUpEvmScriptFactoryInput> {
  get title() {
    return `Add "${this.input.name} Top Up EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  async after({ it, assert, provider }: OmnibusHookCtx) {
    super.after({ it, assert, provider });

    const { agent, easyTrack, stETH } = this.contracts;
    const { token, factory, registry, trustedCaller } = this.input;

    it("Validate factory may make payments", async () => {
      const motionsBefore = await easyTrack.getMotions();

      const erc20Token = ERC20__factory.connect(token, provider);

      const agentTokenBalanceBefore = await erc20Token.balanceOf(agent);

      const recipientsRegistry = await AllowedRecipientsRegistry__factory.connect(registry, provider);
      const recipients = await recipientsRegistry.getAllowedRecipients();

      const recipientsTokenBalancesBefore = await Promise.all(
        recipients.map((recipient) => erc20Token.balanceOf(recipient)),
      );

      // TODO: request token decimals
      const transferAmounts = new Array(recipients.length).fill(1n ** 18n);

      const calldata = AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]"], [recipients, transferAmounts]);

      const { unlock, mine, increaseTime } = providers.cheats(provider);

      const trustedCallerSigner = await unlock(trustedCaller, 10n ** 18n);
      const createTx = await easyTrack
        .connect(trustedCallerSigner)
        .createMotion(factory, calldata, { gasLimit: 3_000_000 });
      await createTx.wait();

      const motionsAfter = await easyTrack.getMotions();

      assert.equal(motionsAfter.length, motionsBefore.length + 1);

      const newMotion = await motionsAfter[motionsAfter.length - 1];

      await increaseTime(newMotion.duration + 1n);
      await mine();

      const enactor = await unlock(DEFAULT_ENACTOR, 10n ** 18n);
      const enactTx = await easyTrack.connect(enactor).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });
      await enactTx.wait();

      const agentTokenBalanceAfter = await erc20Token.balanceOf(agent);
      const recipientBalancesAfter = await Promise.all(recipients.map((recipient) => erc20Token.balanceOf(recipient)));

      const epsilon = token === stETH.address ? 2 : 0;

      assert.approximately(
        agentTokenBalanceAfter,
        agentTokenBalanceBefore - transferAmounts.reduce((sum, val) => sum + val),
        epsilon * transferAmounts.length,
      );

      for (let i = 0; i < recipients.length; ++i) {
        assert.approximately(recipientBalancesAfter[i], recipientsTokenBalancesBefore[i] + transferAmounts[i], epsilon);
      }
    });
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

interface AddTopUpEvmScriptFactoryInput extends AddEvmScriptFactoryInput {
  name: string;
  token: Address;
  registry: Address;
  trustedCaller: Address;
}

class AddAddRecipientEvmScriptFactory extends OmnibusItem<{
  name: string;
  factory: Address;
  registry: Address;
  trustedCaller: Address;
}> {
  get title() {
    return `Add "${this.input.name} Add Recipient EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  get call(): FormattedEvmCall {
    const { easyTrack } = this.contracts;
    const { factory } = this.input;
    return call(easyTrack.addEVMScriptFactory, [factory, this.permission]);
  }

  get events(): EventCheck[] {
    return [
      event(this.contracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [this.input.factory, this.permission],
      }),
    ];
  }

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    const { easyTrack } = this.contracts;
    const { registry, trustedCaller, factory } = this.input;

    it(`Validate new add recipient factory works properly`, async () => {
      const registryContract = AllowedRecipientsRegistry__factory.connect(registry, provider);
      assert.isFalse(await registryContract.isRecipientAllowed(TEST_RECIPIENT));

      const recipientsBefore = await registryContract.getAllowedRecipients();
      const motionsBefore = await easyTrack.getMotions();

      const calldata = AbiCoder.defaultAbiCoder().encode(["address", "string"], [TEST_RECIPIENT, "Test Recipient"]);

      const { mine, unlock, increaseTime } = providers.cheats(provider);

      const trustedSigner = await unlock(trustedCaller);

      const createTx = await easyTrack.connect(trustedSigner).createMotion(factory, calldata, { gasLimit: 5_000_000 });

      await createTx.wait();

      const motionsAfter = await easyTrack.getMotions();
      assert.equal(motionsAfter.length, motionsBefore.length + 1);

      const newMotion = motionsAfter[motionsAfter.length - 1];

      await increaseTime(newMotion.duration + 1n);
      await mine();

      const enactorSigner = await unlock(DEFAULT_ENACTOR, 10n ** 18n);

      await easyTrack.connect(enactorSigner).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });

      const recipientsAfter = await registryContract.getAllowedRecipients();

      assert.equal(recipientsAfter.length, recipientsBefore.length + 1);
      assert.isTrue(await registryContract.isRecipientAllowed(TEST_RECIPIENT));
    });
  }

  private get permission() {
    return bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[this.input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
    );
  }
}

interface AddRemoveRecipientEvmScriptFactoryInput extends AddEvmScriptFactoryInput {
  name: string;
  registry: Address;
  trustedCaller: Address;
}

class AddRemoveRecipientEvmScriptFactory extends AddEvmScriptFactory<AddRemoveRecipientEvmScriptFactoryInput> {
  get title(): string {
    return `Add "${this.input.name} Remove Recipient EVM Script Factory" ${this.input.factory} to EasyTrack`;
  }

  get events(): EventCheck[] {
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

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    const { easyTrack } = this.contracts;
    const { registry, trustedCaller, factory } = this.input;

    it(`Validate new remove recipient factory works properly`, async () => {
      const registryContract = AllowedRecipientsRegistry__factory.connect(registry, provider);

      assert.isTrue(await registryContract.isRecipientAllowed(TEST_RECIPIENT));
      const recipientsBefore = await registryContract.getAllowedRecipients();
      const motionsBefore = await easyTrack.getMotions();
      const calldata = AbiCoder.defaultAbiCoder().encode(["address"], [TEST_RECIPIENT]);

      const { mine, unlock, increaseTime, setBalance } = providers.cheats(provider);

      await setBalance(TEST_RECIPIENT, 10n ** 18n);
      const trustedSigner = await unlock(trustedCaller);
      const createTx = await easyTrack.connect(trustedSigner).createMotion(factory, calldata, { gasLimit: 3_000_000 });
      await createTx.wait();
      const motionsAfter = await easyTrack.getMotions();
      assert.equal(motionsAfter.length, motionsBefore.length + 1);
      const newMotion = motionsAfter[motionsAfter.length - 1];
      await increaseTime(newMotion.duration + 1n);
      await mine();
      const enactorSigner = await unlock(TEST_RECIPIENT);
      await setBalance(TEST_RECIPIENT, 10n ** 18n);
      await easyTrack.connect(enactorSigner).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });
      const recipientsAfter = await registryContract.getAllowedRecipients();
      assert.equal(recipientsAfter.length, recipientsBefore.length - 1);
      assert.isFalse(await registryContract.isRecipientAllowed(TEST_RECIPIENT));
    });
  }
}

export class AddPaymentEvmScriptFactories extends OmnibusItemsGroup<AddPaymentEvmScriptFactoriesInput> {
  private _items: (AddTopUpEvmScriptFactory | AddAddRecipientEvmScriptFactory | AddRemoveRecipientEvmScriptFactory)[];

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

  get items(): OmnibusItem<any>[] {
    return this._items;
  }

  get title(): string {
    return `Add "${this.input.name}" payment EVM Script Factories`;
  }
}
