import { before, describe, it } from "mocha";
import { assert } from "../src/common/assert";
import { BigNumberish, formatEther, JsonRpcProvider } from "ethers";
import { compareEvents, enactOmnibus } from "../src/omnibuses/tools/test";
import networks from "../src/networks";
import lido from "../src/lido";
import omnibus from "../omnibuses/_demo_omnibus";
import { Receipt } from "web3-types";
import { StakingModule } from "../src/lido/lido";
import { checks } from "../src/omnibuses/checks";

const url = networks.localRpcUrl("eth");
const provider = new JsonRpcProvider(url);
const contracts = lido.eth[omnibus.network](provider);

const {
  balance: balanceChecks,
  easyTrack: easyTrackChecks,
  stakingRouter: stakingRouterChecks,
} = checks(contracts, provider);

omnibus.init(provider);

// Testing values
const expectedTargetShare = 400n;
const expectedTreasuryFee = 200n;
const expectedStakingModuleFee = 800n;
const tokenTransfers = [
  {
    recipient: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
    amount: 180000n * 10n ** 18n,
  },
  {
    recipient: "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956",
    amount: 110000n * 10n ** 18n,
  },
];
const newNopCount = 7;
const addFactoryValues = {
  name: "reWARDS stETH",
  factories: {
    topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d" as `0x${string}`,
    addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C" as `0x${string}`,
    removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E" as `0x${string}`,
  },
  token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" as `0x${string}`, // stETH
  registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A" as `0x${string}`,
  trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5" as `0x${string}`,
};

describe("Testing _demo_omnibus", () => {
  let enactReceipt: Receipt;
  let snapshotId: string;

  before(async () => {
    snapshotId = await provider.send("evm_snapshot", []);
  });

  after(async () => {
    await provider.send("evm_revert", [snapshotId]);
  });

  describe("Check network state before voting...", () => {
    it("Simple DVT module state is as expected", async () => {
      await stakingRouterChecks.checkStakingModule(StakingModule.SimpleDVT, {
        targetShare: 400n,
        treasuryFee: 200n,
        stakingModuleFee: 800n,
      });
    });
  });

  describe("Check network state after voting...", () => {
    let agentLDOBalanceBefore: any;
    let balancesBefore: BigNumberish[];
    let nodeOperatorsCountBefore: any;

    before(async () => {
      agentLDOBalanceBefore = await contracts.ldo.balanceOf(contracts.agent.address);
      balancesBefore = await Promise.all(tokenTransfers.map(({ recipient }) => contracts.ldo.balanceOf(recipient)));
      nodeOperatorsCountBefore = await contracts.curatedStakingModule.getNodeOperatorsCount();

      // Start and enact omnibus. Keep receipt to check events later.
      enactReceipt = await enactOmnibus(omnibus, provider);
    });

    describe("TransferAssets", () => {
      for (let i = 0; i < tokenTransfers.length; i++) {
        const { recipient, amount } = tokenTransfers[i];
        it(`${formatEther(amount)} LDO was transferred to ${recipient}`, async () => {
          const expectedBalance = BigInt(balancesBefore[i]) + BigInt(amount);

          await balanceChecks.checkLDOBalance(recipient, expectedBalance);
        });
      }

      it("LDO budget was decreased by the total amount of transfers", async () => {
        const totalSum = tokenTransfers.reduce((acc, { amount }) => acc + amount, 0n);

        await balanceChecks.checkLDOBalance(contracts.agent.address, agentLDOBalanceBefore - totalSum);
      });
    });

    describe("UpdateStakingModule", () => {
      it(`Simple DVT module was correctly updated`, async () => {
        await stakingRouterChecks.checkStakingModule(StakingModule.SimpleDVT, {
          targetShare: expectedTargetShare,
          treasuryFee: expectedTreasuryFee,
          stakingModuleFee: expectedStakingModuleFee,
        });
      });
    });

    describe("AddNodeOperators", () => {
      it(`node operators count was increased by ${newNopCount}`, async () => {
        const expectedNodeOperatorsCount = nodeOperatorsCountBefore + BigInt(newNopCount);

        await stakingRouterChecks.checkNodeOperatorsCount(expectedNodeOperatorsCount);
      });

      const newOperators = omnibus.actions[3]["input"].operators;
      for (let i = 0; i < newOperators.length; i++) {
        const operator = newOperators[i];
        it(`operator ${operator.name} was successfully added`, async () => {
          const operatorIndex = nodeOperatorsCountBefore + BigInt(i);

          await stakingRouterChecks.checkNodeOperator(operatorIndex, operator.name, operator.rewardAddress);
        });
      }
    });

    describe("AddPaymentEvmScriptFactories", () => {
      it(`Top up factory ${addFactoryValues.name} can make payments`, async () => {
        await easyTrackChecks.checkFactoryExists(addFactoryValues.factories.topUp);
        await easyTrackChecks.checkTopUpFactory(
          addFactoryValues.token,
          addFactoryValues.factories.topUp,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        );
      });

      it(`Add recipient factory ${addFactoryValues.name} works as expected`, async () => {
        await easyTrackChecks.checkFactoryExists(addFactoryValues.factories.addRecipient);
        await easyTrackChecks.checkAddRecipientFactory(
          addFactoryValues.factories.addRecipient,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        );
      });

      it(`Remove recipient factory ${addFactoryValues.name} works as expected`, async () => {
        await easyTrackChecks.checkFactoryExists(addFactoryValues.factories.removeRecipient);
        await easyTrackChecks.checkRemoveRecipientFactory(
          addFactoryValues.factories.removeRecipient,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        );
      });
    });
  });

  describe("Check fired events by action...", () => {
    omnibus.actions.forEach((action) => {
      const expectedEvents = action.getExpectedEvents();
      const expectedEventsNames = expectedEvents.map((event) => event.fragment.name);

      it(`${action.constructor.name}: ${expectedEventsNames.join(", ")}`, () => {
        const absentEvents = compareEvents(action.getExpectedEvents(), enactReceipt);

        assert.equal(
          absentEvents.length,
          0,
          `Events not found:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
        );
      });
    });
  });
});
