import { parseEther } from "ethers";

import { OmnibusLaunchTest } from "../../src/omnibus";
import {
  createAndEnactAddRecipientMotion,
  createAndEnactPaymentMotion,
  createAndEnactRemoveRecipientMotion,
} from "../helpers/_easyTrack";

const COVER_INDEX = 0;
const NONCOVER_INDEX = 1;
const INSURANCE_STETH_AMOUNT = parseEther("13.45978634");
const REQUEST_BURN_MY_STETH_ROLE =
  "0x28186f938b759084eea36948ef1cd8b40ec8790a98d5f1a09b70879fe054e5cc";

const gasSupply_stETH_topup_factory = "0x200dA0b6a9905A377CF8D469664C65dB267009d1";
const gasSupply_stETH_addRecipientFactory = "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252";
const gasSupply_stETH_remove_recipient_factory = "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7";
const gasSupply_stETH_multisig = "0x5181d5D56Af4f823b96FE05f062D7a09761a5a53";

const reWARDS_stETH_topupFactory = "0x1F2b79FE297B7098875930bBA6dd17068103897E";
const reWARDS_stETH_addRecipientFactory = "0x935cb3366Faf2cFC415B2099d1F974Fd27202b77";
const reWARDS_stETH_removeRecipientFactory = "0x22010d1747CaFc370b1f1FBBa61022A313c5693b";
const reWARDS_stETH_multisig = "0x87D93d9B2C672bf9c9642d853a8682546a5012B5";

export default OmnibusLaunchTest({
  snapshot: async ({ contracts, addresses }) => ({
    burnedForCover: await contracts.burner.getCoverSharesBurnt(),
    burnedForNonCover: await contracts.burner.getNonCoverSharesBurnt(),
    sharesRequestedToBurn: await contracts.burner.getSharesRequestedToBurn(),
    burnerAllowance: await contracts.lido.allowance(addresses.agent, addresses.burner),
    insuranceFundShares: await contracts.lido.sharesOf(addresses.insuranceFund),
    insuranceFundBalance: await contracts.lido.balanceOf(addresses.insuranceFund),
  }),
  events: async (_, { addresses }) => [
    _.agent.forward(
      _.insuranceFund.transferERC20({
        token: addresses.lido,
        to: addresses.agent,
        amount: INSURANCE_STETH_AMOUNT,
      }),
    ),
    _.agent.forward(
      _.erc20.approve({
        token: addresses.lido,
        owner: addresses.agent,
        spender: addresses.burner,
        amount: INSURANCE_STETH_AMOUNT,
      }),
    ),
    _.agent.forward(
      _.burner.grantRole({
        role: REQUEST_BURN_MY_STETH_ROLE,
        account: addresses.agent,
        sender: addresses.agent,
      }),
    ),
    _.agent.forward(
      _.burner.requestBurnMyStETHForCover({
        caller: addresses.agent,
        burnAmount: INSURANCE_STETH_AMOUNT,
        newApproval: 0n,
      }),
    ),
    _.agent.forward(
      _.burner.revokeRole({
        account: addresses.agent,
        sender: addresses.agent,
        role: REQUEST_BURN_MY_STETH_ROLE,
      }),
    ),

    // II. Add stETH Gas Supply factories

    _.easyTrack.addEvmScriptFactory({
      factory: "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
      permissions:
        "0xb9e5cbb9ca5b0d659238807e84d0176930753d86f636484649d1363016aa899bba09ae972a1bf200ddf8c55f66671229",
    }),
    _.easyTrack.addEvmScriptFactory({
      factory: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
      permissions: "0x49d1363016aa899bba09ae972a1bf200ddf8c55f739b5384",
    }),
    _.easyTrack.addEvmScriptFactory({
      factory: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      permissions: "0x49d1363016aa899bba09ae972a1bf200ddf8c55f12a29198",
    }),

    // III. Add stETH reWARDS factories

    _.easyTrack.addEvmScriptFactory({
      factory: "0x1F2b79FE297B7098875930bBA6dd17068103897E",
      permissions:
        "0xb9e5cbb9ca5b0d659238807e84d0176930753d86f636484648c4929630099b217136b64089e8543db0e5163a66671229",
    }),
    _.easyTrack.addEvmScriptFactory({
      factory: "0x935cb3366Faf2cFC415B2099d1F974Fd27202b77",
      permissions: "0x48c4929630099b217136b64089e8543db0e5163a739b5384",
    }),
    _.easyTrack.addEvmScriptFactory({
      factory: "0x22010d1747CaFc370b1f1FBBa61022A313c5693b",
      permissions: "0x48c4929630099b217136b64089e8543db0e5163a12a29198",
    }),

    // IV. Remove LDO reWARDS factories

    _.easyTrack.removeEvmScriptFactory({
      factory: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
    }),

    // V. Remove LDO and DAI referral program from Easy Track

    _.easyTrack.removeEvmScriptFactory({
      factory: "0x54058ee0E0c87Ad813C002262cD75B98A7F59218",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C",
    }),

    _.easyTrack.removeEvmScriptFactory({
      factory: "0x009ffa22ce4388d2F5De128Ca8E6fD229A312450",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151",
    }),
    _.easyTrack.removeEvmScriptFactory({
      factory: "0xd8f9B72Cd97388f23814ECF429cd18815F6352c1",
    }),
  ],

  tests: async (test, { assert, provider, snapshots, contracts, addresses }) => {
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

    const evmScriptFactories = await contracts.easyTrack.getEVMScriptFactories();

    test("Gas Supply & reWARDS stETH EVM script factories were added to EasyTrack", async () => {
      assert.includeMembers(evmScriptFactories, [
        "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
        "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
        "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      ]);

      assert.includeMembers(evmScriptFactories, [
        "0x1F2b79FE297B7098875930bBA6dd17068103897E",
        "0x935cb3366Faf2cFC415B2099d1F974Fd27202b77",
        "0x22010d1747CaFc370b1f1FBBa61022A313c5693b",
      ]);
    });

    test("reWARDS LDO, referral program LDO and referral program DAI EVM script factories were removed from EasyTrack", async () => {
      assert.notIncludeMembers(evmScriptFactories, [
        "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      ]);

      assert.notIncludeMembers(evmScriptFactories, [
        "0x54058ee0E0c87Ad813C002262cD75B98A7F59218",
        "0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51",
        "0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C",
      ]);

      assert.notIncludeMembers(evmScriptFactories, [
        "0x009ffa22ce4388d2F5De128Ca8E6fD229A312450",
        "0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151",
        "0xd8f9B72Cd97388f23814ECF429cd18815F6352c1",
      ]);
    });

    test("Gas Supply stETH top up factory works properly", async () => {
      await createAndEnactPaymentMotion(provider, {
        factory: gasSupply_stETH_topup_factory,
        recipients: [gasSupply_stETH_multisig],
        token: addresses.lido,
        transferAmounts: [10n ** 19n],
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    const [newRecipient] = await provider.accounts();
    test("Gas Supply stETH add recipient factory works properly", async () => {
      await createAndEnactAddRecipientMotion(provider, {
        factory: gasSupply_stETH_addRecipientFactory,
        recipient: newRecipient,
        title: "Test recipient",
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    test("Gas Supply stETH remove recipient factory works properly", async () => {
      await createAndEnactRemoveRecipientMotion(provider, {
        factory: gasSupply_stETH_remove_recipient_factory,
        recipient: newRecipient,
        trustedCaller: gasSupply_stETH_multisig,
      });
    });

    test("reWARDS stETH top up factory works properly", async () => {
      await createAndEnactPaymentMotion(provider, {
        factory: reWARDS_stETH_topupFactory,
        recipients: [reWARDS_stETH_multisig],
        token: addresses.lido,
        transferAmounts: [10n ** 19n],
        trustedCaller: reWARDS_stETH_multisig,
      });
    });

    test("reWARDS stETH add recipient factory works properly", async () => {
      await createAndEnactAddRecipientMotion(provider, {
        factory: reWARDS_stETH_addRecipientFactory,
        recipient: newRecipient,
        title: "Test recipient",
        trustedCaller: reWARDS_stETH_multisig,
      });
    });

    test("reWARDS stETH remove recipient factory works properly", async () => {
      await createAndEnactRemoveRecipientMotion(provider, {
        factory: reWARDS_stETH_removeRecipientFactory,
        recipient: newRecipient,
        trustedCaller: reWARDS_stETH_multisig,
      });
    });
  },
});
