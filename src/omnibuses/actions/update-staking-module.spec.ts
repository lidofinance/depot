import { UpdateStakingModule } from "./update-staking-module";
import { expect } from "chai";
import sinon from "sinon";
import { StakingModule } from "../../lido/lido";
import { StakingRouter__factory } from "../../../typechain-types";
import { randomAddress, randomHash } from "hardhat/internal/hardhat-network/provider/utils/random";

describe("UpdateStakingModule", () => {
  let mockContracts: any;
  let updateStakingModule: any;
  let SRContract = StakingRouter__factory.connect(randomAddress().toString());

  const testValues = {
    title: "Raise Simple DVT target share from 0.5% to 4%",
    stakingModuleId: StakingModule.SimpleDVT,
    targetShare: 50,
    treasuryFee: 5,
    stakingModuleFee: 3,
  };

  after(() => {
    sinon.restore();
  });

  const getEvent = sinon.stub().callsFake(function (event: string) {
    const fragment = {
      type: "event",
      name: event,
      inputs: [],
    };
    return {
      fragment,
      address: randomAddress(),
    };
  });

  beforeEach(() => {
    mockContracts = {
      stakingRouter: {
        updateStakingModule: {
          _contract: SRContract,
        },
        getStakingModule: sinon.stub().resolves({
          targetShare: 50,
          treasuryFee: 5,
          stakingModuleFee: 3,
        }),
        getEvent,
        address: randomAddress(),
      },
      agent: {
        interface: {
          encodeFunctionData: sinon.stub().returns(randomHash()),
        },
        address: randomAddress(),
        getEvent,
      }, // forwarder
      callsScript: {
        LogScriptCall: {
          called: false,
        },
        getEvent,
        address: randomAddress(),
      },
      voting: {
        getEvent,
        address: randomAddress(),
      },
    };

    updateStakingModule = UpdateStakingModule(mockContracts, {
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: testValues.stakingModuleId,
      targetShare: testValues.targetShare,
      treasuryFee: testValues.treasuryFee,
      stakingModuleFee: testValues.stakingModuleFee,
    });
    updateStakingModule["_contracts"] = mockContracts as any;
  });

  it("should correctly set targetShare, treasuryFee, and stakingModuleFee", async () => {
    const call = updateStakingModule.evmCall["calls"][0];

    expect(call.address).to.equal(await SRContract.getAddress());
    expect(call["args"]).to.deep.equal([
      testValues.stakingModuleId,
      testValues.targetShare,
      testValues.stakingModuleFee,
      testValues.treasuryFee,
    ]);
  });

  it("should emit correct events after update", async () => {
    const events = updateStakingModule.expectedEvents;

    expect(events).to.be.an("array");
    expect(events).to.have.length(5);
    expect(events[0].address).to.equal(mockContracts.voting.address);
    expect(events[0].fragment.name).to.equal("LogScriptCall");
    expect(events[1].address).to.equal(mockContracts.agent.address);
    expect(events[1].fragment.name).to.equal("LogScriptCall");
    expect(events[2].address).to.equal(mockContracts.stakingRouter.address);
    expect(events[2].fragment.name).to.equal("StakingModuleTargetShareSet");
    expect(events[2].args).to.be.an("array");
    expect(events[2].args).to.have.length(3);
    expect(events[2].args![0]).to.equal(testValues.stakingModuleId);
    expect(events[2].args![1]).to.equal(testValues.targetShare);
    expect(events[3].address).to.equal(mockContracts.stakingRouter.address);
    expect(events[3].fragment.name).to.equal("StakingModuleFeesSet");
    expect(events[3].args).to.be.an("array");
    expect(events[3].args).to.have.length(4);
    expect(events[3].args![0]).to.equal(testValues.stakingModuleId);
    expect(events[3].args![1]).to.equal(testValues.stakingModuleFee);
    expect(events[3].args![2]).to.equal(testValues.treasuryFee);
    expect(events[4].address).to.equal(mockContracts.agent.address);
    expect(events[4].fragment.name).to.equal("ScriptResult");
  });
});
