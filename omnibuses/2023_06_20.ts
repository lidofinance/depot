import { parseEther } from 'ethers'
import { Omnibus } from '../src/omnibuses/omnibus'
import { ApplyInsuranceAction } from '../src/omnibuses/actions/apply-insurance'
import { AddPaymentEvmScriptFactories } from '../src/omnibuses/actions/add-payment-evm-script-factories'
import { AccessControlGrantRole } from '../src/omnibuses/actions/access-control-grant-role'
import { AccessControlRevokeRole } from '../src/omnibuses/actions/access-control-revoke-role'
import { RemovePaymentEvmScriptFactories } from '../src/omnibuses/actions/remove-payment-evm-script-factories'

export default new Omnibus({
  network: 'mainnet',
  voteId: 160,
  // execution: { date: "Jun-30-2023 06:46:23 PM UTC", blockNumber: 17593962 },
  launching: { date: 'Jun-27-2023' /* blockNumber: 17572253 */ },
  actions: ({ burner, agent, stETH }) => [
    new AccessControlGrantRole({
      on: burner,
      to: agent,
      role: 'REQUEST_BURN_MY_STETH_ROLE',
      revoked: true,
    }),
    new ApplyInsuranceAction({
      amount: parseEther('13.45978634'),
      before: {
        insuranceFundStEthShares: 5466460000000000000000n,
        insuranceFundStEthBalance: 6168933603752703174674n,
        agentStEthAllowanceForBurner: 0n,
        sharesRequestedToBurn: {
          coverShares: 0n,
          nonCoverShares: 0n,
        },
        totalBurntForCover: 0n,
        totalBurntForNonCover: 506385577569080968748810n,
      },
    }),
    new AccessControlRevokeRole({
      on: burner,
      from: agent,
      role: 'REQUEST_BURN_MY_STETH_ROLE',
    }),
    new AddPaymentEvmScriptFactories({
      name: 'Gas Supply stETH',
      factories: {
        topUp: '0x200dA0b6a9905A377CF8D469664C65dB267009d1',
        addRecipient: '0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252',
        removeRecipient: '0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7',
      },
      token: stETH.address,
      registry: '0x49d1363016aA899bba09ae972a1BF200dDf8C55F',
      trustedCaller: '0x5181d5D56Af4f823b96FE05f062D7a09761a5a53',
    }),
    new AddPaymentEvmScriptFactories({
      name: 'reWARDS stETH',
      factories: {
        topUp: '0x1F2b79FE297B7098875930bBA6dd17068103897E',
        addRecipient: '0x935cb3366Faf2cFC415B2099d1F974Fd27202b77',
        removeRecipient: '0x22010d1747CaFc370b1f1FBBa61022A313c5693b',
      },
      token: stETH.address,
      registry: '0x48c4929630099b217136b64089E8543dB0E5163a',
      trustedCaller: '0x87D93d9B2C672bf9c9642d853a8682546a5012B5',
    }),
    new RemovePaymentEvmScriptFactories({
      name: 'reWARDS LDO',
      factories: {
        topUp: '0x85d703B2A4BaD713b596c647badac9A1e95bB03d',
        addRecipient: '0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C',
        removeRecipient: '0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E',
      },
    }),
    new RemovePaymentEvmScriptFactories({
      name: 'LDO referral program',
      factories: {
        topUp: '0x54058ee0E0c87Ad813C002262cD75B98A7F59218',
        addRecipient: '0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51',
        removeRecipient: '0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C',
      },
    }),
    new RemovePaymentEvmScriptFactories({
      name: 'DAI referral program',
      factories: {
        topUp: '0x009ffa22ce4388d2F5De128Ca8E6fD229A312450',
        addRecipient: '0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151',
        removeRecipient: '0xd8f9B72Cd97388f23814ECF429cd18815F6352c1',
      },
    }),
  ],
})
