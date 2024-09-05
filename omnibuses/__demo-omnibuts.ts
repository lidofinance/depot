import omnibuses from "../src/omnibuses/omnibuses";

export default omnibuses.create({
  network: "mainnet",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  items: ({ actions, contracts }) => [
    actions.stakingRouter.updateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModule: "SDVT",
      targetShare: 4_00,
      treasuryFee: 2_00,
      stakingModuleFee: 8_00,
    }),
    actions.easyTrack.addPaymentEvmScriptFactories({
      name: "reWARDS stETH",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
    }),
    actions.tokens.transferLDO({
      title: "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
      to: "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956", // Argo Technology Consulting Ltd. (ATC) multisig
      amount: 110_000n * 10n ** 18n,
    }),
    actions.easyTrack.removePaymentEvmScriptFactories({
      name: "reWARDS LDO",
      factories: {
        topUp: "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
        addRecipient: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
        removeRecipient: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      },
    })
  ],
});
