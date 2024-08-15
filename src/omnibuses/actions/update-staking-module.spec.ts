import { UpdateStakingModule } from "./update-staking-module";
import { expect } from "chai";
import sinon from "sinon";
import { StakingModule } from "../../lido/lido";
import { AragonEvmForward, ContractEvmCall } from "../../votes/vote-script";
import { StakingRouter__factory } from "../../../typechain-types";
import { randomAddress, randomHash } from "hardhat/internal/hardhat-network/provider/utils/random";

describe("UpdateStakingModule", () => {
  let updateStakingModule: UpdateStakingModule;
  let mockContracts: any;
  let SRContract = StakingRouter__factory.connect(randomAddress().toString());

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

    updateStakingModule = new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 50,
      treasuryFee: 5,
      stakingModuleFee: 3,
    });
    updateStakingModule["_contracts"] = mockContracts as any;
  });

  it("should correctly set targetShare, treasuryFee, and stakingModuleFee", async () => {
    const evmCalls: AragonEvmForward[] = updateStakingModule.getEVMCalls() as AragonEvmForward[];
    const call = evmCalls[0]["calls"][0];

    expect(evmCalls[0]["calls"]).to.be.an("array");
    expect(evmCalls[0]["calls"]).to.have.length(1);
    expect(call.address).to.equal(await SRContract.getAddress());
    expect(call["args"]).to.deep.equal([
      updateStakingModule["input"].stakingModuleId,
      updateStakingModule["input"].targetShare,
      updateStakingModule["input"].stakingModuleFee,
      updateStakingModule["input"].treasuryFee,
    ]);
  });

  it("should emit correct events after update", async () => {
    const events = updateStakingModule.getExpectedEvents();

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
    expect(events[2].args![0]).to.equal(updateStakingModule["input"].stakingModuleId);
    expect(events[2].args![1]).to.equal(updateStakingModule["input"].targetShare);
    expect(events[3].address).to.equal(mockContracts.stakingRouter.address);
    expect(events[3].fragment.name).to.equal("StakingModuleFeesSet");
    expect(events[3].args).to.be.an("array");
    expect(events[3].args).to.have.length(4);
    expect(events[3].args![0]).to.equal(updateStakingModule["input"].stakingModuleId);
    expect(events[3].args![1]).to.equal(updateStakingModule["input"].stakingModuleFee);
    expect(events[3].args![2]).to.equal(updateStakingModule["input"].treasuryFee);
    expect(events[4].address).to.equal(mockContracts.agent.address);
    expect(events[4].fragment.name).to.equal("ScriptResult");
  });
});
