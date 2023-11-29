import { AbiCoder } from "ethers";
import { call, event } from "../../votes";
import {
  OmnibusAction,
  OmnibusBeforeContext,
  OmnibusTestContext,
  TitledEventChecks,
  TitledEvmCall,
} from "../omnibus";
import {
  AddAllowedRecipient__factory,
  AllowedRecipientsRegistry__factory,
  ERC20__factory,
} from "../../../typechain-types";
import bytes from "../../common/bytes";
import providers from "../../providers";

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

export class AddPaymentEvmScriptFactories extends OmnibusAction<AddPaymentEvmScriptFactoriesInput> {
  private get permissions() {
    const { registry } = this.input;
    const { finance } = this.contracts;
    return {
      topUp: bytes.join(
        // allow to call finance.newImmediatePayment()
        ...[finance.address, finance.newImmediatePayment.fragment.selector],
        // allow to call allowedRecipientsRegistry.updateSpentAmount()
        ...[registry, iAllowedRecipientsRegistry.getFunction("updateSpentAmount").selector],
      ),
      addRecipient: bytes.join(
        // allow to call allowedRecipientsRegistry.addRecipient()
        ...[registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector],
      ),
      removeRecipient: bytes.join(
        // allow to call allowedRecipientsRegistry.addRecipient()
        ...[registry, iAllowedRecipientsRegistry.getFunction("removeRecipient").selector],
      ),
    };
  }

  calls(): TitledEvmCall[] {
    const { easyTrack } = this.contracts;
    const {
      name,
      factories: { topUp, addRecipient, removeRecipient },
    } = this.input;
    const permissions = this.permissions;
    const res: TitledEvmCall[] = [
      [
        `Add "${name}" top up EVM script factory`,
        call(easyTrack.addEVMScriptFactory, [topUp, permissions.topUp]),
      ],
    ];
    if (addRecipient) {
      res.push([
        `Add "${name}" add recipient EVM script factory`,
        call(easyTrack.addEVMScriptFactory, [addRecipient, permissions.addRecipient]),
      ]);
    }
    if (removeRecipient) {
      res.push([
        `Add "${name}" remove recipient EVM script factory`,
        call(easyTrack.addEVMScriptFactory, [removeRecipient, permissions.removeRecipient]),
      ]);
    }
    return res;
  }
  events(): TitledEventChecks[] {
    const { easyTrack } = this.contracts;
    const permissions = this.permissions;
    const {
      factories: { topUp, addRecipient, removeRecipient },
    } = this.input;

    const res: TitledEventChecks[] = [
      [
        `Add "top up" EVM script factory ${topUp}`,
        event(easyTrack, "EVMScriptFactoryAdded", { args: [topUp, permissions.topUp] }),
      ],
    ];

    if (addRecipient) {
      res.push([
        `Add "add recipient" EVM script factory ${addRecipient}`,
        event(easyTrack, "EVMScriptFactoryAdded", {
          args: [addRecipient, permissions.addRecipient],
        }),
      ]);
    }

    if (removeRecipient) {
      res.push([
        `Add "add recipient" EVM script factory ${removeRecipient}`,
        event(easyTrack, "EVMScriptFactoryAdded", {
          args: [removeRecipient, permissions.removeRecipient],
        }),
      ]);
    }

    return res;
  }

  async test({ it, assert, provider }: OmnibusTestContext): Promise<void> {
    const {
      registry,
      trustedCaller,
      factories: { topUp, addRecipient, removeRecipient },
    } = this.input;
    const { easyTrack, agent, stETH } = this.contracts;

    const evmScriptFactories = await easyTrack.getEVMScriptFactories();

    it("Validate top up evm script factory was added", async () => {
      assert.includeMembers(evmScriptFactories, [topUp]);
    });

    if (addRecipient) {
      it("Validate add recipient evm script factory was added", async () => {
        assert.includeMembers(evmScriptFactories, [addRecipient]);
      });
    }

    if (removeRecipient) {
      it("Validate remove recipient evm script factory was added", async () => {
        assert.includeMembers(evmScriptFactories, [removeRecipient]);
      });
    }

    it("Validate new top up factory works properly", async () => {
      const {
        token,
        factories: { topUp },
      } = this.input;

      const motionsBefore = await easyTrack.getMotions();

      const erc20Token = ERC20__factory.connect(token, provider);

      const agentTokenBalanceBefore = await erc20Token.balanceOf(agent);

      const recipientsRegistry = await AllowedRecipientsRegistry__factory.connect(
        registry,
        provider,
      );
      const recipients = await recipientsRegistry.getAllowedRecipients();

      const recipientsTokenBalancesBefore = await Promise.all(
        recipients.map((recipient) => erc20Token.balanceOf(recipient)),
      );

      // TODO: request token decimals
      const transferAmounts = new Array(recipients.length).fill(1n ** 18n);

      const calldata = AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [recipients, transferAmounts],
      );

      const { unlock, mine, increaseTime } = providers.cheats(provider);

      const trustedCallerSigner = await unlock(trustedCaller, 10n ** 18n);
      const createTx = await easyTrack
        .connect(trustedCallerSigner)
        .createMotion(topUp, calldata, { gasLimit: 3_000_000 });
      await createTx.wait();

      const motionsAfter = await easyTrack.getMotions();

      assert.equal(motionsAfter.length, motionsBefore.length + 1);

      const newMotion = await motionsAfter[motionsAfter.length - 1];

      await increaseTime(newMotion.duration + 1n);
      await mine();

      const enactor = await unlock(DEFAULT_ENACTOR, 10n ** 18n);
      const enactTx = await easyTrack
        .connect(enactor)
        .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });
      await enactTx.wait();

      const agentTokenBalanceAfter = await erc20Token.balanceOf(agent);
      const recipientBalancesAfter = await Promise.all(
        recipients.map((recipient) => erc20Token.balanceOf(recipient)),
      );

      const epsilon = token === stETH.address ? 2 : 0;

      assert.approximately(
        agentTokenBalanceAfter,
        agentTokenBalanceBefore - transferAmounts.reduce((sum, val) => sum + val),
        epsilon * transferAmounts.length,
      );

      for (let i = 0; i < recipients.length; ++i) {
        assert.approximately(
          recipientBalancesAfter[i],
          recipientsTokenBalancesBefore[i] + transferAmounts[i],
          epsilon,
        );
      }
    });

    if (addRecipient) {
      it(`Validate new add recipient factory works properly`, async () => {
        const registryContract = AllowedRecipientsRegistry__factory.connect(registry, provider);
        assert.isFalse(await registryContract.isRecipientAllowed(TEST_RECIPIENT));

        const recipientsBefore = await registryContract.getAllowedRecipients();
        const motionsBefore = await easyTrack.getMotions();

        const calldata = AbiCoder.defaultAbiCoder().encode(
          ["address", "string"],
          [TEST_RECIPIENT, "Test Recipient"],
        );

        const { mine, unlock, increaseTime } = providers.cheats(provider);

        const trustedSigner = await unlock(trustedCaller);

        const createTx = await easyTrack
          .connect(trustedSigner)
          .createMotion(addRecipient, calldata, { gasLimit: 5_000_000 });

        await createTx.wait();

        const motionsAfter = await easyTrack.getMotions();
        assert.equal(motionsAfter.length, motionsBefore.length + 1);

        const newMotion = motionsAfter[motionsAfter.length - 1];

        await increaseTime(newMotion.duration + 1n);
        await mine();

        const enactorSigner = await unlock(DEFAULT_ENACTOR, 10n ** 18n);

        await easyTrack
          .connect(enactorSigner)
          .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });

        const recipientsAfter = await registryContract.getAllowedRecipients();

        assert.equal(recipientsAfter.length, recipientsBefore.length + 1);
        assert.isTrue(await registryContract.isRecipientAllowed(TEST_RECIPIENT));
      });
    }

    // TODO: uncomment & fix test
    // if (removeRecipient) {
    //   it(`Validate new remove recipient factory works properly`, async () => {
    //     const { easyTrack } = await lido.connect(provider);
    //     const factory = AddAllowedRecipient__factory.connect(motionParams.factory, provider);
    //     const registry = AllowedRecipientsRegistry__factory.connect(
    //       await factory.allowedRecipientsRegistry(),
    //       provider,
    //     );
    //     assert.isTrue(await registry.isRecipientAllowed(motionParams.recipient));

    //     const recipientsBefore = await registry.getAllowedRecipients();
    //     const motionsBefore = await easyTrack.getMotions();

    //     const calldata = AbiCoder.defaultAbiCoder().encode(["address"], [motionParams.recipient]);

    //     await provider.setBalance(motionParams.recipient, 10n ** 18n);
    //     const trustedSigner = await provider.unlock(motionParams.trustedCaller);

    //     const createTx = await easyTrack
    //       .connect(trustedSigner)
    //       .createMotion(motionParams.factory, calldata, { gasLimit: 3_000_000 });

    //     await createTx.wait();

    //     const motionsAfter = await easyTrack.getMotions();
    //     assert.equal(motionsAfter.length, motionsBefore.length + 1);

    //     const newMotion = motionsAfter[motionsAfter.length - 1];

    //     await provider.increaseTime(newMotion.duration + 1n);
    //     await provider.mine();

    //     const enactorSigner = await provider.unlock(enactor);
    //     await provider.setBalance(enactor, 10n ** 18n);

    //     await easyTrack
    //       .connect(enactorSigner)
    //       .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });

    //     const recipientsAfter = await registry.getAllowedRecipients();

    //     assert.equal(recipientsAfter.length, recipientsBefore.length - 1);
    //     assert.isFalse(await registry.isRecipientAllowed(motionParams.recipient));
    //   });
    // }
  }
}
