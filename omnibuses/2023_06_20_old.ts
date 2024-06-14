import { ContractMethod, parseEther } from "ethers";
import { Omnibus } from "../src/omnibuses/omnibus";
import { AllowedRecipientsRegistry__factory } from "../typechain-types";
import { TypedContractMethod } from "../typechain-types/common";

const INSURANCE_STETH_AMOUNT = parseEther("13.45978634");
const REQUEST_BURN_MY_STETH_ROLE = "0x28186f938b759084eea36948ef1cd8b40ec8790a98d5f1a09b70879fe054e5cc";

const gasSupply_stEth_registry = AllowedRecipientsRegistry__factory.connect(
  "0x49d1363016aA899bba09ae972a1BF200dDf8C55F",
);
const gasSupply_stETH_topup_factory = "0x200dA0b6a9905A377CF8D469664C65dB267009d1";
const gasSupply_stETH_add_recipient_factory = "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252";
const gasSupply_stETH_remove_recipient_factory = "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7";

const reWARDS_stETH_registry = AllowedRecipientsRegistry__factory.connect("0x48c4929630099b217136b64089E8543dB0E5163a");
const reWARDS_stETH_topupFactory = "0x1F2b79FE297B7098875930bBA6dd17068103897E";
const reWARDS_stETH_addRecipientFactory = "0x935cb3366Faf2cFC415B2099d1F974Fd27202b77";
const reWARDS_stETH_removeRecipientFactory = "0x22010d1747CaFc370b1f1FBBa61022A313c5693b";

const reWARDS_LDO_topupFactory = "0x85d703B2A4BaD713b596c647badac9A1e95bB03d";
const reWARDS_LDO_addRecipientFactory = "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C";
const reWARDS_LDO_removeRecipientFactory = "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E";

const referralProgram_LDO_topupFactory = "0x54058ee0E0c87Ad813C002262cD75B98A7F59218";
const referralProgram_LDO_addRecipientFactory = "0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51";
const referralProgram_LDO_removeRecipientFactory = "0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C";

const referralProgram_DAI_topupFactory = "0x009ffa22ce4388d2F5De128Ca8E6fD229A312450";
const referralProgram_DAI_addRecipientFactory = "0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151";
const referralProgram_DAI_removeRecipientFactory = "0xd8f9B72Cd97388f23814ECF429cd18815F6352c1";

const polygonTeamAddress = "0x9cd7477521B7d7E7F9e2F091D2eA0084e8AaA290";
const polygonTeamIncentivesAmount = 150_000n * 10n ** 18n;

const pmlMultisig = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
const pmlTopUpAmount = 200_000n * 10n ** 18n;

const CertusOneJumpcryptoId = 1;
const CertusOneJumpcryptoNewName = "Jump Crypto";

const ConsenSysCodefiConsensysId = 21;
const ConsenSysCodefiConsensysNewName = "Consensys";

const SkillZKilnId = 8;
const SkillZKilnNewName = "Kiln";
const SkillZKilnNewAddress = "0xD6B7d52E15678B9195F12F3a6D6cb79dcDcCb690";

const RockLogicId = 22;
const RockLogicNewAddress = "0x765c6a8f20c842E8C826B0D9425015784F982aFc";

interface Addressable {
  address: string;
}

function addr(strings: TemplateStringsArray): Addressable {
  return { address: strings[0] };
}

export default new Omnibus({
  network: "mainnet",
  launch: "2023-06-20",
  payload: ({
    actions,
    parser,
    contracts: { agent, finance, voting, stETH, burner, curatedStakingModule, insuranceFund },
  }) => [
    // I. Apply Insurance
    "Transfer 13.45978634 stETH from Insurance fund to Agent",
    actions.agent.forward(insuranceFund.transferERC20, [stETH, agent, INSURANCE_STETH_AMOUNT]),

    "Set 13.45978634 stETH as the allowance of Burner over the Agent's tokens",
    actions.agent.forward(stETH.approve, [burner, INSURANCE_STETH_AMOUNT]),

    "Grant REQUEST_BURN_MY_STETH_ROLE to Agent",
    actions.agent.forward(burner.grantRole, [REQUEST_BURN_MY_STETH_ROLE, agent]),

    "Request to burn 13.45978634 stETH for cover",
    actions.agent.forward(burner.requestBurnMyStETHForCover, [INSURANCE_STETH_AMOUNT]),

    "Renounce REQUEST_BURN_MY_STETH_ROLE from Agent",
    actions.agent.forward(burner.renounceRole, [REQUEST_BURN_MY_STETH_ROLE, agent]),

    // II. Add stETH Gas Supply factories

    "Add Gas Supply top up EVM script factory for stETH",
    actions.easyTrack.addEvmScriptFactory(gasSupply_stETH_topup_factory, {
      permissions: [finance.newImmediatePayment, gasSupply_stEth_registry.updateSpentAmount],
    }),

    "Add Gas Supply add recipient EVM script factory for stETH",
    actions.easyTrack.addEvmScriptFactory(gasSupply_stETH_add_recipient_factory, {
      permissions: [gasSupply_stEth_registry.addRecipient],
    }),

    "Add Gas Supply remove recipient EVM script factory for stETH",
    actions.easyTrack.addEvmScriptFactory(gasSupply_stETH_remove_recipient_factory, {
      permissions: [gasSupply_stEth_registry.removeRecipient],
    }),

    // III. Add stETH reWARDS factories

    "Add reWARDS program top up EVM script factory for stETH 0x1F2b79FE297B7098875930bBA6dd17068103897E",
    actions.easyTrack.addEvmScriptFactory(reWARDS_stETH_topupFactory, {
      permissions: [finance.newImmediatePayment, reWARDS_stETH_registry.updateSpentAmount],
    }),

    "Add reWARDS program add recipient EVM script factory for stETH 0x935cb3366Faf2cFC415B2099d1F974Fd27202b77",
    actions.easyTrack.addEvmScriptFactory(reWARDS_stETH_addRecipientFactory, {
      permissions: [reWARDS_stETH_registry.addRecipient],
    }),

    "Add reWARDS program remove recipient EVM script factory for stETH 0x22010d1747CaFc370b1f1FBBa61022A313c5693b",
    actions.easyTrack.addEvmScriptFactory(reWARDS_stETH_removeRecipientFactory, {
      permissions: [reWARDS_stETH_registry.removeRecipient],
    }),

    // IV. Remove LDO reWARDS factories

    "Remove reWARDS program top up EVM script factory for LDO 0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
    actions.easyTrack.removeEvmScriptFactory(reWARDS_LDO_topupFactory),

    "Remove reWARDS program add recipient EVM script factory for LDO 0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
    actions.easyTrack.removeEvmScriptFactory(reWARDS_LDO_addRecipientFactory),

    "Remove reWARDS program remove recipient EVM script factory for LDO 0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
    actions.easyTrack.removeEvmScriptFactory(reWARDS_LDO_removeRecipientFactory),

    // V. Remove LDO and DAI referral program from Easy Track

    "Remove referral program top up EVM script factory for LDO 0x54058ee0E0c87Ad813C002262cD75B98A7F59218 from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_LDO_topupFactory),

    "Remove referral program add recipient EVM script factory for LDO 0x929547490Ceb6AeEdD7d72F1Ab8957c0210b6E51 from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_LDO_addRecipientFactory),

    "Remove referral program remove recipient EVM script factory for LDO 0xE9eb838fb3A288bF59E9275Ccd7e124fDff88a9C from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_LDO_removeRecipientFactory),

    "Remove referral program top up EVM script factory for DAI 0x009ffa22ce4388d2F5De128Ca8E6fD229A312450 from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_DAI_topupFactory),

    "Remove referral program add recipient EVM script factory for DAI 0x8F06a7f244F6Bb4B68Cd6dB05213042bFc0d7151 from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_DAI_addRecipientFactory),

    "Remove referral program remove recipient EVM script factory for DAI 0xd8f9B72Cd97388f23814ECF429cd18815F6352c1 from Easy Track",
    actions.easyTrack.removeEvmScriptFactory(referralProgram_DAI_removeRecipientFactory),

    // VI. Polygon team incentives

    "Send 150,000 LDO to Lido on Polygon team 0x9cd7477521B7d7E7F9e2F091D2eA0084e8AaA290 for reaching 3% share milestone",
    actions.finance.makeLdoPayment({
      recipient: polygonTeamAddress,
      amount: polygonTeamIncentivesAmount,
      reference:
        "Incentives for Lido on Polygon team 0x9cd7477521B7d7E7F9e2F091D2eA0084e8AaA290 for reaching 3% share milestone",
    }),

    // VII. Send 200k LDO to PML multisig 0x17F6b2C738a63a8D3A113a228cfd0b373244633D

    "Send 200,000 LDO to PML multisig 0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
    actions.finance.makeLdoPayment({
      recipient: pmlMultisig,
      amount: pmlTopUpAmount,
      reference: "Transfer 200k LDO to PML multisig 0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
    }),

    // VIII. Change NO names and addresses

    "Create permission for MANAGE_NODE_OPERATOR_ROLE assigning it to Voting",
    actions.acl.createPermission({
      entity: voting.address,
      targetApp: curatedStakingModule.address,
      permission: "MANAGE_NODE_OPERATOR_ROLE",
      manager: voting.address,
    }),

    "Change the on-chain name of node operator with id 1 from 'Certus One' to 'Jump Crypto'",
    actions.nodeOperatorsRegistry.setNodeOperatorName({
      id: CertusOneJumpcryptoId,
      name: CertusOneJumpcryptoNewName,
    }),

    "Change the on-chain name of node operator with id 21 from 'ConsenSys Codefi' to 'Consensys'",
    actions.nodeOperatorsRegistry.setNodeOperatorName({
      id: ConsenSysCodefiConsensysId,
      name: ConsenSysCodefiConsensysNewName,
    }),

    "Change the on-chain name of node operator with id 8 from 'SkillZ' to 'Kiln'",
    actions.nodeOperatorsRegistry.setNodeOperatorName({
      id: SkillZKilnId,
      name: SkillZKilnNewName,
    }),

    "Change the reward address of node operator with id 8 from 0xe080E860741b7f9e8369b61645E68AD197B1e74C to 0xD6B7d52E15678B9195F12F3a6D6cb79dcDcCb690",
    actions.nodeOperatorsRegistry.setNodeOperatorRewardAddress({
      id: SkillZKilnId,
      rewardAddress: SkillZKilnNewAddress,
    }),

    "Change the reward address of node operator with id 22 from 0x49Df3CCa2670eB0D591146B16359fe336e476F29 to 0x765c6a8f20c842E8C826B0D9425015784F982aFc",
    actions.nodeOperatorsRegistry.setNodeOperatorRewardAddress({
      id: RockLogicId,
      rewardAddress: RockLogicNewAddress,
    }),

    "Revoke MANAGE_NODE_OPERATOR_ROLE from Voting",
    actions.acl.revokePermission({
      revokeFrom: voting.address,
      permission: "MANAGE_NODE_OPERATOR_ROLE",
      targetApp: curatedStakingModule.address,
    }),
  ],
});
