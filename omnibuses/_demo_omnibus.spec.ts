import { assert } from "../src/common/assert";
import { JsonRpcProvider } from "ethers";
import { Suite, Test } from "mocha";
import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";
import { enactOmnibus, validateVotingEvents } from "../src/omnibuses/tools/test";
import networks, { NetworkName } from "../src/networks";
import lido from "../src/lido";
import { AddNodeOperators } from "../src/omnibuses/actions/add-node-operators";

describe("Test _demo_omnibus using actions test functions", async function () {
  const omnibus: Omnibus<NetworkName> = require(`../omnibuses/_demo_omnibus.ts`).default;
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[omnibus.network](provider);

  omnibus.init(provider);

  const actions = {
    transferAssets: new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
      token: contracts.ldo,
      amount: 180000n * 10n ** 18n,
    }),
    updateStakingModule: new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 800,
      stakingModuleFee: 200,
    }),
    addNodeOperators: new AddNodeOperators({
      operators: [
        {
          name: "A41",
          rewardAddress: "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7",
        },
        {
          name: "Develp GmbH",
          rewardAddress: "0x0a6a0b60fFeF196113b3530781df6e747DdC565e",
        },
        {
          name: "Ebunker",
          rewardAddress: "0x2A2245d1f47430b9f60adCFC63D158021E80A728",
        },
        {
          name: "Gateway.fm AS",
          rewardAddress: "0x78CEE97C23560279909c0215e084dB293F036774",
        },
        {
          name: "Numic",
          rewardAddress: "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC",
        },
        {
          name: "ParaFi Technologies LLC",
          rewardAddress: "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7",
        },
        {
          name: "RockawayX Infra",
          rewardAddress: "0xcA6817DAb36850D58375A10c78703CE49d41D25a",
        },
      ],
    }),
  };

  // Running before hooks & checks for the omnibus...
  const actionsSuite = Suite.create(this, "Testing omnibus actions...");
  actionsSuite.beforeAll(async () => {
    await actions.transferAssets.before();
    await actions.addNodeOperators.before(contracts);

    actionsSuite.ctx.enactReceipt = await enactOmnibus(omnibus, provider);
  });

  // Testing TransferAssets action...
  const transferAssetsSuite = Suite.create(actionsSuite, "Testing TransferAssets action...");
  (await actions.transferAssets.tests()).forEach((test) => transferAssetsSuite.addTest(test));

  // Testing UpdateStakingModule action...
  const updateStakingModuleSuite = Suite.create(actionsSuite, "Testing UpdateStakingModule action...");
  (await actions.updateStakingModule.tests(contracts)).forEach((test) => updateStakingModuleSuite.addTest(test));

  // Testing AddNodeModules action...
  const addNodeOperators = Suite.create(actionsSuite, "Testing AddNodeOperators action...");
  (await actions.addNodeOperators.tests(contracts)).forEach((test) => addNodeOperators.addTest(test));

  // Validating the voting items...
  const validateEventsSuite = Suite.create(actionsSuite, "Validating the omnibus events");
  await validateVotingEvents(omnibus, validateEventsSuite);
});

describe("Test _demo_omnibus following test state pattern", async function () {
  const omnibus: Omnibus<NetworkName> = require(`../omnibuses/_demo_omnibus.ts`).default;
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[omnibus.network](provider);

  Suite.create(this, "Testing omnibus actions...").addTest(
    new Test("network state before as expected", async function () {
      const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);
      assert.isTrue((await contracts.ldo.balanceOf("0x17F6b2C738a63a8D3A113a228cfd0b373244633D")) > 0);
      assert.equal(stakingModule.targetShare, 400n);
    }),
  );

  const stateAfterSuite = Suite.create(this, "Testing omnibus actions...");
  stateAfterSuite.beforeAll(async () => {
    stateAfterSuite.ctx.balanceBefore = await contracts.ldo.balanceOf("0x17F6b2C738a63a8D3A113a228cfd0b373244633D");
    stateAfterSuite.ctx.nodeOperatorsBefore = await contracts.curatedStakingModule.getNodeOperatorsCount();

    const validateEventsSuite = Suite.create(this, "Validating the omnibus events");
    validateEventsSuite.ctx.enactReceipt = await enactOmnibus(omnibus, provider);
    await validateVotingEvents(omnibus, validateEventsSuite);
  });

  stateAfterSuite.addTest(
    new Test("network state after as expected", async function () {
      const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);
      assert.equal(
        await contracts.ldo.balanceOf("0x17F6b2C738a63a8D3A113a228cfd0b373244633D"),
        stateAfterSuite.ctx.balanceBefore + 180000n * 10n ** 18n,
      );
      assert.equal(stakingModule.targetShare, 400n);
      assert.equal(
        await contracts.curatedStakingModule.getNodeOperatorsCount(),
        stateAfterSuite.ctx.nodeOperatorsBefore + 7n,
      );
    }),
  );
});
