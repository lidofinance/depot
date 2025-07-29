/*
Vote 2025_07_16

I. PML, ATC, RCC ET Factories Removal
1. Remove PML stablecoins factory 0x92a27C4e5e35cFEa112ACaB53851Ec70e2D99a8D from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea
2. Remove PML stETH factory 0xc5527396DDC353BD05bBA578aDAa1f5b6c721136 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea
3. Remove ATC stablecoins factory 0x1843Bc35d1fD15AbE1913b9f72852a79457C42Ab from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea
4. Remove ATC stETH factory 0x87b02dF27cd6ec128532Add7C8BC19f62E6f1fB9 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea
5. Remove RCC stablecoins factory 0x75bDecbb6453a901EBBB945215416561547dfDD4 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea
6. Remove RCC stETH factory 0xcD42Eb8a5db5a80Dc8f643745528DD77cf4C7D35 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea

II. CSM Parameters Change
7. Change stakeShareLimit from 200 BP to 300 BP and priorityExitShareThreshold from 250 to 375 on Staking Router 0xFdDf38947aFB03C621C71b06C9C70bce73f12999 for CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F
8. Grant MODULE_MANAGER_ROLE on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F to Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c
9. Reduce keyRemovalCharge from 0.02 to 0 ETH on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F
10. Revoke MODULE_MANAGER_ROLE on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F from Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c

III. CS Verifier rotation
11. Revoke VERIFIER_ROLE role on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F from old CS Verifier 0x0c345dFa318f9F4977cdd4f33d80F9D0ffA38e8B
12. Grant VERIFIER_ROLE role on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F to new CS Verifier 0xeC6Cc185f671F627fb9b6f06C8772755F587b05d

VI. Change staking reward address and name for P2P.org Node Operator
13. Change staking reward address from 0x9a66fd7948a6834176fbb1c4127c61cb6d349561 to 0xfeef177E6168F9b7fd59e6C5b6c2d87FF398c6FD for node operator with id = 2 in Curated Module Node Operator Registry 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5
14. Change name from “P2P.ORG - P2P Validator” to “P2P.org” for node operator with id = 2 in Curated Module Node Operator Registry 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5

V. Kyber Oracle Rotation
15. Remove Oracle Set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from HashConsensus 0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288 for AccountingOracle 0x852deD011285fe67063a08005c71a85690503Cee
16. Remove Oracle Set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from HashConsensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a for ValidatorsExitBusOracle 0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e
17. Remove Oracle Set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from CSHashConsensus 0x71093efF8D8599b5fA340D665Ad60fA7C80688e4 for CSFeeOracle 0x4D4074628678Bd302921c20573EEa1ed38DdF7FB
18. Add Oracle Set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to HashConsensus 0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288 for AccountingOracle 0x852deD011285fe67063a08005c71a85690503Cee
19. Add Oracle Set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to HashConsensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a for ValidatorsExitBusOracle 0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e
20. Add Oracle Set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to CSHashConsensus 0x71093efF8D8599b5fA340D665Ad60fA7C80688e4 for CSFeeOracle 0x4D4074628678Bd302921c20573EEa1ed38DdF7FB
*/

import { assert } from "chai";

import bytes from "../src/common/bytes";
import { Omnibus } from "../src/omnibuses/omnibus";
import { keccak256, parseEther, toHex } from "viem";

const CSM_MODULE_ID = 3n;
const NEW_KEY_REMOVAL_CHARGE = 0n;

const CSM_STAKE_SHARE_LIMIT_OLD = 2_00;
const CSM_STAKE_SHARE_LIMIT_NEW = 3_00n;

const CSM_PRIORITY_EXIT_SHARE_THRESHOLD_BEFORE = 250;
const KEY_REMOVAL_CHARGE_BEFORE = parseEther("0.02");
// const CSM_PRIORITY_EXIT_SHARE_THRESHOLD_AFTER = 375

const CSM_TREASURY_FEE_BEFORE = 400;
const CSM_STAKING_MODULE_FEE_BEFORE = 600;
const CSM_MAX_DEPOSITS_PER_BLOCK_BEFORE = 30n;
const CSM_MIN_DEPOSIT_BLOCK_DISTANCE_BEFORE = 25n;

const PRIORITY_EXIT_SHARE_THRESHOLD_NEW = 3_75n;
const OLD_CS_VERIFIER = "0x0c345dFa318f9F4977cdd4f33d80F9D0ffA38e8B";
const NEW_CS_VERIFIER = "0xeC6Cc185f671F627fb9b6f06C8772755F587b05d";

const PML_STABLECOINS_FACTORY = "0x92a27C4e5e35cFEa112ACaB53851Ec70e2D99a8D";
const PML_STETH_FACTORY = "0xc5527396DDC353BD05bBA578aDAa1f5b6c721136";

const ATC_STABLECOINS_FACTORY = "0x1843Bc35d1fD15AbE1913b9f72852a79457C42Ab";
const ATC_STETH_FACTORY = "0x87b02dF27cd6ec128532Add7C8BC19f62E6f1fB9";

const RCC_STABLECOINS_FACTORY = "0x75bDecbb6453a901EBBB945215416561547dfDD4";
const RCC_STETH_FACTORY = "0xcD42Eb8a5db5a80Dc8f643745528DD77cf4C7D35";

const P2P_NO_ID = 2n;
const P2P_NO_NAME_OLD = "P2P.ORG - P2P Validator";
const P2P_NO_NAME_NEW = "P2P.org";

const P2P_NO_STAKING_REWARDS_ADDRESS_OLD = "0x9a66fd7948a6834176fbb1c4127c61cb6d349561";
const P2P_NO_STAKING_REWARDS_ADDRESS_NEW = "0xfeef177E6168F9b7fd59e6C5b6c2d87FF398c6FD";

const voteDescription = `1. **Rotate Lido on Ethereum Oracle Set member Kyber Network for Caliber**, as per [Snapshot decision](https://snapshot.box/#/s:lido-snapshot.eth/proposal/0xdc208507ca0f659c7f9e38056288aedb7610816ea4020ca751c3422434780de8). Items 1.1–1.6.
2. **Increase CSM stake share limit from 2% to 3%**. [Snapshot](https://snapshot.box/#/s:lido-snapshot.eth/proposal/0xcd1c1a051888efd495d97458ae9fa4fe5198616eb3d92a71d3352d9f25e79c4e). Item 1.7.
3. **Enable a grace period for CSM Node Operators** by setting \`keyRemovalCharge = 0\`. [Proposed on the Forum](https://research.lido.fi/t/community-staking-module/5917/133). Items 1.8-1.10.
4. **Introduce a simplified CSVerifier for CSM**. [Proposed on the forum](https://research.lido.fi/t/community-staking-module/5917/143). Items 1.11, 1.12. Audit & deployment verification by [MixBytes](https://github.com/lidofinance/audits/blob/main/MixBytes%20Lido%20CSM%20Security%20Audit%20Report%2007-2025.pdf).
5. **Update the reward address and name for Node Operator ID 2 \`P2P.ORG - P2P Validator\`**. [Requested on the forum](https://research.lido.fi/t/node-operator-registry-name-reward-address-change/4170/44). Items 1.13, 1.14.
6. **Switch off Easy Track environment for PML, ATC, RCC entities**, deprecated after Snapshot-approved transition to [Lido Labs](https://snapshot.box/#/s:lido-snapshot.eth/proposal/0xdf648307e68415e7b5cf96c6afbabd696c1731839f4b4a7cf5cb7efbc44ee9d6) and [Lido Ecosystem](https://snapshot.box/#/s:lido-snapshot.eth/proposal/0x7f72f12d72643c20cd0455c603d344050248e75ed1074c8391fae4c30f09ca15) BORG Foundations. Items 2–7.`;

const proposalDescription = `Kyber Oracle Rotation, CSM Parameters Change, CS Verifier rotation, Change staking reward address and name for P2P.org Node Operator`;

export default Omnibus.create({
  network: "mainnet",
  description: voteDescription,

  calls: ({ blueprints, contracts, submitProposal, call, forward, event }) => [
    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0x92a27C4e5e35cFEa112ACaB53851Ec70e2D99a8D",
      title:
        "Remove PML stablecoins factory 0x92a27C4e5e35cFEa112ACaB53851Ec70e2D99a8D from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0xc5527396DDC353BD05bBA578aDAa1f5b6c721136",
      title:
        "Remove PML stETH factory 0xc5527396DDC353BD05bBA578aDAa1f5b6c721136 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0x1843Bc35d1fD15AbE1913b9f72852a79457C42Ab",
      title:
        "Remove ATC stablecoins factory 0x1843Bc35d1fD15AbE1913b9f72852a79457C42Ab from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0x87b02dF27cd6ec128532Add7C8BC19f62E6f1fB9",
      title:
        "Remove ATC stETH factory 0x87b02dF27cd6ec128532Add7C8BC19f62E6f1fB9 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0x75bDecbb6453a901EBBB945215416561547dfDD4",
      title:
        "Remove RCC stablecoins factory 0x75bDecbb6453a901EBBB945215416561547dfDD4 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    blueprints.easyTrack.removeEvmScriptFactory({
      factory: "0xcD42Eb8a5db5a80Dc8f643745528DD77cf4C7D35",
      title:
        "Remove RCC stETH factory 0xcD42Eb8a5db5a80Dc8f643745528DD77cf4C7D35 from Easy Track 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    }),

    submitProposal(contracts.dualGovernance, {
      description: proposalDescription,
      calls: [
        forward(contracts.agent, [
          blueprints.stakingRouter.updateStakingModule({
            title:
              "Change stakeShareLimit from 200 BP to 300 BP and priorityExitShareThreshold from 250 to 375 on Staking Router 0xFdDf38947aFB03C621C71b06C9C70bce73f12999 for CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F",
            stakingModuleId: CSM_MODULE_ID,
            stakeShareLimit: CSM_STAKE_SHARE_LIMIT_NEW,
            priorityExitShareThreshold: PRIORITY_EXIT_SHARE_THRESHOLD_NEW,
            treasuryFee: 4_00n,
            stakingModuleFee: 6_00n,
            maxDepositsPerBlock: 30n,
            minDepositBlockDistance: 25n,
          }),

          blueprints.accessControl.grantRole({
            title:
              "Grant MODULE_MANAGER_ROLE on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F to Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
            on: contracts.csModule,
            role: "MODULE_MANAGER_ROLE",
            to: contracts.agent.address,
          }),

          blueprints.accessControl.revokeRole({
            title:
              "Revoke MODULE_MANAGER_ROLE on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F from Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
            role: "MODULE_MANAGER_ROLE",
            on: contracts.csModule,
            from: contracts.agent.address,
          }),

          blueprints.accessControl.revokeRole({
            title:
              "Revoke VERIFIER_ROLE role on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F from old CS Verifier 0x0c345dFa318f9F4977cdd4f33d80F9D0ffA38e8B",
            on: contracts.csModule,
            role: "VERIFIER_ROLE",
            from: OLD_CS_VERIFIER,
          }),

          blueprints.accessControl.grantRole({
            title:
              "Grant VERIFIER_ROLE role on CSModule 0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F to new CS Verifier 0xeC6Cc185f671F627fb9b6f06C8772755F587b05d",
            on: contracts.csModule,
            role: "VERIFIER_ROLE",
            to: NEW_CS_VERIFIER,
          }),

          blueprints.stakingModule.setNodeOperatorRewardAddressCall({
            title:
              "Change staking reward address from 0x9a66fd7948a6834176fbb1c4127c61cb6d349561 to 0xfeef177E6168F9b7fd59e6C5b6c2d87FF398c6FD for node operator with id = 2 in Curated Module Node Operator Registry 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
            module: contracts.curatedStakingModule,
            nodeOperatorId: P2P_NO_ID,
            rewardAddress: "0xfeef177E6168F9b7fd59e6C5b6c2d87FF398c6FD",
          }),

          blueprints.stakingModule.setNodeOperatorNameCall({
            title:
              "Change name from “P2P.ORG - P2P Validator” to “P2P.org” for node operator with id = 2 in Curated Module Node Operator Registry 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
            module: contracts.curatedStakingModule,
            nodeOperatorId: P2P_NO_ID,
            name: "P2P.org",
          }),

          blueprints.hashConsensus.removeMemberCall({
            title:
              "Remove oracle set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from HashConsensus 0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288 for AccountingOracle 0x852deD011285fe67063a08005c71a85690503Cee",
            contract: contracts.accountingHashConsensus,
            member: "0xA7410857ABbf75043d61ea54e07D57A6EB6EF186",
            quorum: 5n,
            newMembersCount: 8n,
          }),

          blueprints.hashConsensus.removeMemberCall({
            title:
              "Remove oracle set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from HashConsensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a for ValidatorsExitBusOracle",
            contract: contracts.veboHashConsensus,
            member: "0xA7410857ABbf75043d61ea54e07D57A6EB6EF186",
            quorum: 5n,
            newMembersCount: 8n,
          }),

          blueprints.hashConsensus.removeMemberCall({
            title:
              "Remove oracle set member with address 0xA7410857ABbf75043d61ea54e07D57A6EB6EF186 from HashConsensus 0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288 for CSOracle",
            contract: contracts.csHashConsensus,
            member: "0xA7410857ABbf75043d61ea54e07D57A6EB6EF186",
            quorum: 5n,
            newMembersCount: 8n,
          }),

          blueprints.hashConsensus.addMemberCall({
            title:
              "Add oracle set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to HashConsensus for AccountingOracle",
            contract: contracts.accountingHashConsensus,
            member: "0x4118dad7f348a4063bd15786c299de2f3b1333f3",
            quorum: 5n,
            newMembersCount: 9n,
          }),

          blueprints.hashConsensus.addMemberCall({
            title:
              "Add oracle set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to HashConsensus for ValidatorsExitBusOracle",
            contract: contracts.veboHashConsensus,
            member: "0x4118dad7f348a4063bd15786c299de2f3b1333f3",
            quorum: 5n,
            newMembersCount: 9n,
          }),

          blueprints.hashConsensus.addMemberCall({
            title:
              "Add oracle set member with address 0x4118dad7f348a4063bd15786c299de2f3b1333f3 to HashConsensus for CSOracle",
            contract: contracts.csHashConsensus,
            member: "0x4118dad7f348a4063bd15786c299de2f3b1333f3",
            quorum: 5n,
            newMembersCount: 9n,
          }),
        ]),
      ],
    }),
  ],

  test: async ({ contracts, client, checks, passOmnibus, passProposals }) => {
    const factoriesCountBefore = (await client.read(contracts.easyTrack, "getEVMScriptFactories", [])).length;

    await checks.easyTrack.checkFactoriesExists([
      PML_STABLECOINS_FACTORY,
      PML_STETH_FACTORY,
      ATC_STABLECOINS_FACTORY,
      ATC_STETH_FACTORY,
      RCC_STABLECOINS_FACTORY,
      RCC_STETH_FACTORY,
    ]);

    const { submittedProposalIds } = await passOmnibus();

    // ---
    // I. PML, ATC, RCC ET Factories Removal
    // ---

    await checks.easyTrack.checkFactoriesNotExists([
      PML_STABLECOINS_FACTORY,
      PML_STETH_FACTORY,
      ATC_STABLECOINS_FACTORY,
      ATC_STETH_FACTORY,
      RCC_STABLECOINS_FACTORY,
      RCC_STETH_FACTORY,
    ]);

    assert.equal(
      (await client.read(contracts.easyTrack, "getEVMScriptFactories", [])).length,
      factoriesCountBefore - 6,
    );

    // ---
    // II. CSM Parameters Change
    // ---
    const CSM_VERIFIER_ROLE = keccak256(toHex("VERIFIER_ROLE"));

    const moduleInfoBefore = await client.read(contracts.stakingRouter, "getStakingModule", [CSM_MODULE_ID]);

    assert.equal(moduleInfoBefore.stakeShareLimit, CSM_STAKE_SHARE_LIMIT_OLD);
    assert.equal(moduleInfoBefore.priorityExitShareThreshold, CSM_PRIORITY_EXIT_SHARE_THRESHOLD_BEFORE);
    assert.equal(moduleInfoBefore.stakingModuleFee, CSM_STAKING_MODULE_FEE_BEFORE);
    assert.equal(moduleInfoBefore.treasuryFee, CSM_TREASURY_FEE_BEFORE);
    assert.equal(moduleInfoBefore.maxDepositsPerBlock, CSM_MAX_DEPOSITS_PER_BLOCK_BEFORE);
    assert.equal(moduleInfoBefore.minDepositBlockDistance, CSM_MIN_DEPOSIT_BLOCK_DISTANCE_BEFORE);

    assert.isFalse(await client.read(contracts.csModule, "hasRole", [CSM_VERIFIER_ROLE, contracts.agent.address]));
    assert.equal(await client.read(contracts.csModule, "keyRemovalCharge", []), KEY_REMOVAL_CHARGE_BEFORE);

    // ---
    // III. CS Verifier rotation
    // ---

    assert.isTrue(await client.read(contracts.csModule, "hasRole", [CSM_VERIFIER_ROLE, contracts.csVerifier.address]));
    assert.isFalse(
      await client.read(contracts.csModule, "hasRole", [CSM_VERIFIER_ROLE, contracts.csVerifier_Proposed.address]),
    );

    // ---
    // IV. Change staking reward address and name for P2P.org Node Operator
    // ---

    const [, name, rewardAddress] = await client.read(contracts.curatedStakingModule, "getNodeOperator", [
      P2P_NO_ID,
      true,
    ]);

    assert.equal(name, P2P_NO_NAME_OLD);
    assert.isTrue(bytes.isEqual(rewardAddress, P2P_NO_STAKING_REWARDS_ADDRESS_OLD));

    await passProposals(submittedProposalIds);
  },
});
