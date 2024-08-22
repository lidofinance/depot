import { assert } from "../src/common/assert";
import { formatEther, JsonRpcProvider } from "ethers";
import { describe, it } from "mocha";
import { StakingModule } from "../src/lido/lido";
import { compareEvents, enactOmnibus } from "../src/omnibuses/tools/test";
import networks from "../src/networks";
import lido from "../src/lido";
import omnibus from "../omnibuses/_demo_omnibus";
import { Receipt } from "web3-types";
import { AddNodeOperators, NewNodeOperatorInput } from "../src/omnibuses/actions/add-node-operators";

const url = networks.localRpcUrl("eth");
const provider = new JsonRpcProvider(url);
const contracts = lido.eth[omnibus.network](provider);

omnibus.init(provider);

// Testing values
const ldoRecipient = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
const ldoAmount = 180000n * 10n ** 18n;
const expectedTargetShare = 400n;
const newNopCount = 7;

describe("Testing _demo_omnibus...", () => {
  let enactReceipt: Receipt;

  describe("Check network state before voting...", () => {
    it("Simple DVT module target share is 4%", async () => {
      const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

      assert.equal(stakingModule.targetShare, 400n);
    });
  });

  describe("Check network state after voting...", () => {
    let balanceBefore: any;
    let nodeOperatorsBefore: any;

    before(async () => {
      balanceBefore = await contracts.ldo.balanceOf(ldoRecipient);
      nodeOperatorsBefore = await contracts.curatedStakingModule.getNodeOperatorsCount();

      // Run and enact omnibus. Keep receipt for further event checks.
      enactReceipt = await enactOmnibus(omnibus, provider);
    });

    describe("TransferAssets", () => {
      it(`${formatEther(ldoAmount)} LDO was transferred to ${ldoRecipient}`, async () => {
        const balanceAfter = await contracts.ldo.balanceOf(ldoRecipient);

        assert.equal(balanceAfter, balanceBefore + ldoAmount);
      });
    });

    describe("UpdateStakingModule", () => {
      it(`Simple DVT module target share was set to ${expectedTargetShare}`, async () => {
        const stakingModule = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

        assert.equal(stakingModule.targetShare, expectedTargetShare);
      });
    });

    describe("AddNodeOperators", () => {
      it(`node operators count was increased by ${newNopCount}`, async () => {
        const expectedNodeOperatorsCount = nodeOperatorsBefore + BigInt(newNopCount);
        const nodeOperatorsCount = await contracts.curatedStakingModule.getNodeOperatorsCount();

        assert.equal(nodeOperatorsCount, expectedNodeOperatorsCount);
      });

      const operators = omnibus.actions[2]["input"].operators;
      operators.forEach((operator: NewNodeOperatorInput, idx: number) => {
        it(`operator ${operator.name} was added`, async () => {
          const { name, rewardAddress } = operator;
          const nopID = nodeOperatorsBefore + BigInt(idx);
          const nopInfo = await contracts.curatedStakingModule.getNodeOperator(nopID, false);

          assert.equal(nopInfo.rewardAddress, rewardAddress, `Operator ${name} not found`);
        });
      });
    });
  });

  // TODO: approve events check method
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
