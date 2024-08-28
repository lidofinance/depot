import { describe, it } from "mocha";
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

const { Balance: balanceChecks, StakingRouter: stakingRouterChecks } = checks(contracts);

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

describe("Testing _demo_omnibus", () => {
  let enactReceipt: Receipt;

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
