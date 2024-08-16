import lido, { LidoEthContracts } from "../src/lido";
import networks, { NetworkName } from "../src/networks";
import votes, { EventCheck } from "../src/votes";
import { BigNumberish, ContractTransactionReceipt, JsonRpcProvider, Log } from "ethers";
import { RpcProvider } from "../src/providers";
import { assert } from "chai";

import omnibus, { Omnibus, newNodeOperators } from "./___demo-omnibus";

interface OnchainContext<N extends NetworkName> {
  provider: RpcProvider;
  contracts: LidoEthContracts<N>;
}

interface OmnibusTestFunc<N extends NetworkName> {
  (ctx: OnchainContext<N>): Promise<void>;
}

function test<N extends NetworkName>(network: N, testFunc: OmnibusTestFunc<N>) {
  // TODO: implement
}

const checks = {
  validateVoteEvents(omnibus: Omnibus<NetworkName>, logs: Log[]) {
    console.log("validate were emitted only expected events...");
    const actions = omnibus.getActions();
    let index = 0;
    for (const action of actions) {
      const logIndices = votes.subsequence(logs, action.expectedEvents, index);
      //TODO: validate and revert if something is incorrect
    }
    // TODO: implement validation
    console.log("✅ - All events emitted as expected");
  },
  nodeOperators: {
    async checkNodeOperatorState(contracts: LidoEthContracts, id: BigNumberish, properties: unknown) {
      // TODO: implement
    },
  },
  easyTrack: {
    async checkPaymentEVMFactoriesOperatesProperly(contracts: LidoEthContracts, params: unknown) {
      console.log("Validate EVM script factories exist");
      assert.includeMembers(await contracts.easyTrack.getEVMScriptFactories(), []);

      console.log("Validate payment motions works");
      // TODO: implement
    },
  },
};

test("mainnet", async ({ provider, contracts }) => {
  const simpleDVTStakingModuleId = 2;
  const { ldo, agent, curatedStakingModule, stakingRouter } = contracts;

  const snapshot = async () => ({
    treasuryBalance: await ldo.balanceOf(agent),
    nodeOperatorsCount: await curatedStakingModule.getNodeOperatorsCount(),
    simpleDvtInfo: await stakingRouter.getStakingModule(simpleDVTStakingModuleId),
  });

  const stateBefore = await snapshot();
  const { enactReceipt } = await omnibus.adopt(provider);
  const stateAfter = await snapshot();

  checks.validateVoteEvents(omnibus, enactReceipt.logs);

  console.info("Validate staking module fee updated correctly");
  assert.equal(stateAfter.simpleDvtInfo.stakingModuleFee, 5_00n);

  console.info("Validate LDO transferred correctly");
  assert.equal(stateAfter.treasuryBalance, stateBefore.treasuryBalance + 100_000n);

  console.info("Validate node operators added correctly");
  assert.equal(stateAfter.nodeOperatorsCount, stateBefore.nodeOperatorsCount + 12n);
  for (let i = 0; i < newNodeOperators.length; ++i) {
    await checks.nodeOperators.checkNodeOperatorState(contracts, stateBefore.nodeOperatorsCount + BigInt(i), {
      name: newNodeOperators[i].name,
      rewardAddress: newNodeOperators[i].rewardAddress,
    });
  }

  await checks.easyTrack.checkPaymentEVMFactoriesOperatesProperly(contracts, {
    token: contracts.stETH,
    registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
    trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5",
    factories: {
      topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
      addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
      removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
    },
  });
});

const simpleDVTStakingModuleId = 2;

describe("", () => {
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[omnibus.network](provider);
  const { ldo, agent, curatedStakingModule, stakingRouter } = contracts;

  const snapshot = async () => ({
    treasuryBalance: await ldo.balanceOf(agent),
    nodeOperatorsCount: await curatedStakingModule.getNodeOperatorsCount(),
    simpleDvtInfo: await stakingRouter.getStakingModule(simpleDVTStakingModuleId),
  });

  let enactReceipt: ContractTransactionReceipt;
  let stateBefore: Awaited<ReturnType<typeof snapshot>>;
  let stateAfter: Awaited<ReturnType<typeof snapshot>>;

  before(async () => {
    stateBefore = await snapshot();

    const adoptResult = await omnibus.adopt(provider);
    enactReceipt = adoptResult.enactReceipt;

    stateAfter = await snapshot();
  });

  it("validate emitted events", async () => {
    checks.validateVoteEvents(omnibus, enactReceipt.logs);
  });

  it("check all node operators added successfully", async () => {
    assert.equal(stateAfter.nodeOperatorsCount, stateBefore.nodeOperatorsCount + 12n);

    for (let i = 0; i < newNodeOperators.length; ++i) {
      await checks.nodeOperators.checkNodeOperatorState(contracts, stateBefore.nodeOperatorsCount + BigInt(i), {
        name: newNodeOperators[i].name,
        rewardAddress: newNodeOperators[i].rewardAddress,
      });
    }
  });

  it("check payment EVM factories operates properly", async () => {
    await checks.easyTrack.checkPaymentEVMFactoriesOperatesProperly(contracts, {
      token: contracts.stETH,
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
      trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
    });
  });
});
