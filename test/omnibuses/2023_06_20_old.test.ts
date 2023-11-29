import { parseEther } from "ethers";

import { OmnibusLaunchTest } from "../../src/omnibuses/omnibus";
import {
  createAndEnactAddRecipientMotion,
  createAndEnactPaymentMotion,
  createAndEnactRemoveRecipientMotion,
} from "../helpers/_easyTrack";
import { AllowedRecipientsRegistry__factory } from "../../typechain-types";

const COVER_INDEX = 0;
const NONCOVER_INDEX = 1;
const INSURANCE_STETH_AMOUNT = parseEther("13.45978634");
const REQUEST_BURN_MY_STETH_ROLE =
  "0x28186f938b759084eea36948ef1cd8b40ec8790a98d5f1a09b70879fe054e5cc";

const gasSupply_stEth_registry = AllowedRecipientsRegistry__factory.connect(
  "0x49d1363016aA899bba09ae972a1BF200dDf8C55F",
);
const gasSupply_stETH_topup_factory = "0x200dA0b6a9905A377CF8D469664C65dB267009d1";
const gasSupply_stETH_addRecipientFactory = "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252";
const gasSupply_stETH_remove_recipient_factory = "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7";
const gasSupply_stETH_multisig = "0x5181d5D56Af4f823b96FE05f062D7a09761a5a53";

const reWARDS_stETH_registry = AllowedRecipientsRegistry__factory.connect(
  "0x48c4929630099b217136b64089E8543dB0E5163a",
);
const reWARDS_stETH_topupFactory = "0x1F2b79FE297B7098875930bBA6dd17068103897E";
const reWARDS_stETH_addRecipientFactory = "0x935cb3366Faf2cFC415B2099d1F974Fd27202b77";
const reWARDS_stETH_removeRecipientFactory = "0x22010d1747CaFc370b1f1FBBa61022A313c5693b";
const reWARDS_stETH_multisig = "0x87D93d9B2C672bf9c9642d853a8682546a5012B5";

const reWARDS_LDO_topupFactory = "0x85d703B2A4BaD713b596c647badac9A1e95bB03d";
const reWARDS_LDO_addRecipientFactory = "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C";
const reWARDS_LDO_removeRecipientFactory = "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E";

const referralProgram_LDO_topupFactory = "0x54058ee0E0c87Ad813C002262cD75B98A7F59218";
const referralProgram_LDO_addRecipientFactory = "0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51";
const referralProgram_LDO_removeRecipientFactory = "0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C";

const referralProgram_DAI_topupFactory = "0x009ffa22ce4388d2F5De128Ca8E6fD229A312450";
const referralProgram_DAI_addRecipientFactory = "0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151";
const referralProgram_DAI_removeRecipientFactory = "0xd8f9B72Cd97388f23814ECF429cd18815F6352c1";

export default OmnibusLaunchTest({
  snapshot: async ({ contracts: { agent, burner, stETH, insuranceFund } }) => ({
    burnedForCover: await burner.getCoverSharesBurnt(),
    burnedForNonCover: await burner.getNonCoverSharesBurnt(),
    sharesRequestedToBurn: await burner.getSharesRequestedToBurn(),
    burnerAllowance: await stETH.allowance(agent, burner),
    insuranceFundShares: await stETH.sharesOf(insuranceFund),
    insuranceFundBalance: await stETH.balanceOf(insuranceFund),
  }),
  events: async (check, { contracts: { stETH, burner, finance, agent } }) => [
    check.agent.forward(
      check.insuranceFund.transferERC20({
        token: stETH,
        to: agent,
        amount: INSURANCE_STETH_AMOUNT,
      }),
    ),
    check.agent.forward(
      check.erc20.approve({
        token: stETH,
        owner: agent,
        spender: burner,
        amount: INSURANCE_STETH_AMOUNT,
      }),
    ),
    check.agent.forward(
      check.burner.grantRole({
        role: REQUEST_BURN_MY_STETH_ROLE,
        account: agent,
        sender: agent,
      }),
    ),
    check.agent.forward(
      check.burner.requestBurnMyStETHForCover({
        caller: agent,
        burnAmount: INSURANCE_STETH_AMOUNT,
        newApproval: 0n,
      }),
    ),
    check.agent.forward(
      check.burner.revokeRole({ account: agent, sender: agent, role: REQUEST_BURN_MY_STETH_ROLE }),
    ),

    // II. Add stETH Gas Supply factories

    check.easyTrack.addEvmScriptFactory(gasSupply_stETH_topup_factory, {
      permissions: [finance.newImmediatePayment, gasSupply_stEth_registry.updateSpentAmount],
    }),
    check.easyTrack.addEvmScriptFactory(gasSupply_stETH_addRecipientFactory, {
      permissions: [gasSupply_stEth_registry.addRecipient],
    }),
    check.easyTrack.addEvmScriptFactory(gasSupply_stETH_remove_recipient_factory, {
      permissions: [gasSupply_stEth_registry.removeRecipient],
    }),

    // III. Add stETH reWARDS factories

    check.easyTrack.addEvmScriptFactory(reWARDS_stETH_topupFactory, {
      permissions: [finance.newImmediatePayment, reWARDS_stETH_registry.updateSpentAmount],
    }),
    check.easyTrack.addEvmScriptFactory(reWARDS_stETH_addRecipientFactory, {
      permissions: [reWARDS_stETH_registry.addRecipient],
    }),
    check.easyTrack.addEvmScriptFactory(reWARDS_stETH_removeRecipientFactory, {
      permissions: [reWARDS_stETH_registry.removeRecipient],
    }),

    // IV. Remove LDO reWARDS factories

    check.easyTrack.removeEvmScriptFactory(reWARDS_LDO_topupFactory),
    check.easyTrack.removeEvmScriptFactory(reWARDS_LDO_addRecipientFactory),
    check.easyTrack.removeEvmScriptFactory(reWARDS_LDO_removeRecipientFactory),

    // V. Remove LDO and DAI referral program from Easy Track

    check.easyTrack.removeEvmScriptFactory(referralProgram_LDO_topupFactory),
    check.easyTrack.removeEvmScriptFactory(referralProgram_LDO_addRecipientFactory),
    check.easyTrack.removeEvmScriptFactory(referralProgram_LDO_removeRecipientFactory),

    check.easyTrack.removeEvmScriptFactory(referralProgram_DAI_topupFactory),
    check.easyTrack.removeEvmScriptFactory(referralProgram_DAI_addRecipientFactory),
    check.easyTrack.removeEvmScriptFactory(referralProgram_DAI_removeRecipientFactory),
  ],

  tests: async (test, { assert, provider, snapshots, contracts: { stETH, easyTrack } }) => {
    test("stETH balance of Insurance fund decreased (approximately) on 13.45978634", () => {
      assert.approximately(
        snapshots.after.insuranceFundBalance,
        snapshots.before.insuranceFundBalance - INSURANCE_STETH_AMOUNT,
        2,
      );
    });

    test("Shares requested to burn increased correctly", () => {
      assert.equal(
        snapshots.after.sharesRequestedToBurn[COVER_INDEX] -
          snapshots.before.sharesRequestedToBurn[COVER_INDEX],
        snapshots.before.insuranceFundShares - snapshots.after.insuranceFundShares,
      );
    });

    test("Non cover shares to burn stayed the same", () => {
      assert.equal(
        snapshots.before.sharesRequestedToBurn[NONCOVER_INDEX],
        snapshots.after.sharesRequestedToBurn[NONCOVER_INDEX],
      );
    });

    test("stETH allowance is zero", () => {
      assert.equal(snapshots.after.burnerAllowance, 0n);
    });

    const evmScriptFactories = await easyTrack.getEVMScriptFactories();

    test("Gas Supply & reWARDS stETH EVM script factories were added to EasyTrack", async () => {
      console.log(easyTrack, easyTrack.connect(provider));

      assert.includeMembers(evmScriptFactories, [
        gasSupply_stETH_topup_factory,
        gasSupply_stETH_addRecipientFactory,
        gasSupply_stETH_remove_recipient_factory,
      ]);

      assert.includeMembers(evmScriptFactories, [
        reWARDS_stETH_topupFactory,
        reWARDS_stETH_addRecipientFactory,
        reWARDS_stETH_removeRecipientFactory,
      ]);
    });

    test("reWARDS LDO, referral program LDO and referral program DAI EVM script factories were removed from EasyTrack", async () => {
      assert.notIncludeMembers(evmScriptFactories, [
        reWARDS_LDO_topupFactory,
        reWARDS_LDO_addRecipientFactory,
        reWARDS_LDO_removeRecipientFactory,
      ]);

      assert.notIncludeMembers(evmScriptFactories, [
        referralProgram_LDO_topupFactory,
        referralProgram_LDO_addRecipientFactory,
        referralProgram_LDO_removeRecipientFactory,
      ]);

      assert.notIncludeMembers(evmScriptFactories, [
        referralProgram_DAI_topupFactory,
        referralProgram_DAI_addRecipientFactory,
        referralProgram_DAI_removeRecipientFactory,
      ]);
    });

    test("Gas Supply stETH top up factory works properly", async () => {
      await createAndEnactPaymentMotion(provider, {
        factory: gasSupply_stETH_topup_factory,
        recipients: [gasSupply_stETH_multisig],
        token: stETH.address,
        transferAmounts: [10n ** 19n],
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    const [newRecipient] = await provider.signers();
    test("Gas Supply stETH add recipient factory works properly", async () => {
      await createAndEnactAddRecipientMotion(provider, {
        factory: gasSupply_stETH_addRecipientFactory,
        recipient: newRecipient.address,
        title: "Test recipient",
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    test("Gas Supply stETH remove recipient factory works properly", async () => {
      await createAndEnactRemoveRecipientMotion(provider, {
        factory: gasSupply_stETH_remove_recipient_factory,
        recipient: newRecipient.address,
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    test("reWARDS stETH top up factory works properly", async () => {
      await createAndEnactPaymentMotion(provider, {
        factory: reWARDS_stETH_topupFactory,
        recipients: [reWARDS_stETH_multisig],
        token: stETH.address,
        transferAmounts: [10n ** 19n],
        trustedCaller: reWARDS_stETH_multisig,
      });
    });

    test("reWARDS stETH add recipient factory works properly", async () => {
      await createAndEnactAddRecipientMotion(provider, {
        factory: reWARDS_stETH_addRecipientFactory,
        recipient: newRecipient.address,
        title: "Test recipient",
        trustedCaller: reWARDS_stETH_multisig,
      });
    });

    test("reWARDS stETH remove recipient factory works properly", async () => {
      await createAndEnactRemoveRecipientMotion(provider, {
        factory: reWARDS_stETH_removeRecipientFactory,
        recipient: newRecipient.address,
        trustedCaller: reWARDS_stETH_multisig,
      });
    });
  },
});
