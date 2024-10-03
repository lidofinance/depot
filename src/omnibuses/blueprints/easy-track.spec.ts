import { expect } from "chai";
import { randomAddress } from "hardhat/internal/hardhat-network/provider/utils/random";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import sinon from "sinon";
import * as voteScripts from "../../votes/vote-script";
import * as voteEvents from "../../votes/events";
import stakingRouter from "./staking-router";
import easyTrack from "./easy-track";
import { assert } from "../../common/assert";
import { Contracts } from "../../contracts/contracts";
import { Lido } from "../../../configs/types";
import { AllowedRecipientsRegistry__factory } from "../../../typechain-types/factories/interfaces";

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface();

describe("AddNodeOperators", () => {
  let addNodeOperatorsAction: any;

  beforeEach(() => {
    sinon.stub(voteScripts, "call");
    sinon.stub(voteEvents, "event");
    addNodeOperatorsAction = stakingRouter.addNodeOperators({ curatedStakingModule: sinon.stub() } as any, {
      operators: [
        { name: "Operator 1", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 2", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 3", rewardAddress: randomAddress().toString() as HexStrPrefixed },
      ],
    });
  });

  after(() => {
    sinon.restore();
  });

  it("should return the correct title", () => {
    expect(addNodeOperatorsAction.title).to.equal("Add 3 node operators:\n - Operator 1\n - Operator 2\n - Operator 3");
  });
});

describe("EVM script factories", () => {
  let callStub: sinon.SinonStub;
  let eventStub: sinon.SinonStub;
  beforeEach(() => {
    callStub = sinon.stub(voteScripts, "call");
    eventStub = sinon.stub(voteEvents, "event");
  });
  afterEach(() => {
    sinon.restore();
  });

  it("removeEvmScriptFactory works as expected", async () => {
    const mockContracts = {
      easyTrack: { removeEVMScriptFactory: "0xremoveEVMScriptFactory" },
      callsScript: {},
      voting: {},
    };
    const input = { factory: "0xFactoryAddress", title: "Remove Factory" };

    const result = easyTrack.removeEvmScriptFactory(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, input.title);
    assert.isTrue(callStub.calledOnceWith(mockContracts.easyTrack.removeEVMScriptFactory, [input.factory]));
    assert.isTrue(eventStub.calledTwice);
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(eventStub.calledWith(mockContracts.easyTrack, "EVMScriptFactoryRemoved", { args: [input.factory] }));
  });

  it("addEvmScriptFactory works as expected", async () => {
    const mockContracts = {
      easyTrack: { addEVMScriptFactory: "0xaddEVMScriptFactory" },
      callsScript: {},
      voting: {},
    };
    const input = { factory: "0xFactoryAddress", title: "Add Factory", permission: "0xPermission" as HexStrPrefixed };

    const result = easyTrack.addEvmScriptFactory(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, input.title);
    assert.isTrue(
      callStub.calledOnceWith(mockContracts.easyTrack.addEVMScriptFactory, [input.factory, input.permission]),
    );
    assert.isTrue(eventStub.calledTwice);
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [input.factory, input.permission],
      }),
    );
  });

  it("addTopUpEvmScriptFactory works as expected", async () => {
    const mockContracts = {
      easyTrack: { addEVMScriptFactory: "0xaddEVMScriptFactory" },
      finance: {
        address: "0xFinanceAddress",
        newImmediatePayment: {
          fragment: {
            selector: "0xSelector",
          },
        },
      },
      callsScript: {},
      voting: {},
    };
    const input = {
      factory: "0xFactoryAddress",
      name: "FactoryName",
      registry: "0xRegistryAddress",
    };

    const permission = bytes.join(
      ...[mockContracts.finance.address, mockContracts.finance.newImmediatePayment.fragment.selector],
      ...[input.registry, iAllowedRecipientsRegistry.getFunction("updateSpentAmount").selector],
    );

    const result = easyTrack.addTopUpEvmScriptFactory(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, `Add top up EVM Script Factory "${input.name}"`);
    assert.isTrue(callStub.calledOnceWith(mockContracts.easyTrack.addEVMScriptFactory, [input.factory, permission]));
    assert.isTrue(eventStub.calledTwice);
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [input.factory, permission],
      }),
    );
  });

  it("addAddRecipientEvmScriptFactory works as expected", async () => {
    const mockContracts = {
      easyTrack: { addEVMScriptFactory: "0xaddEVMScriptFactory" },
      callsScript: {},
      voting: {},
    };
    const input = {
      factory: "0xFactoryAddress",
      name: "FactoryName",
      registry: "0xRegistryAddress",
    };

    const permission = bytes.join(...[input.registry, iAllowedRecipientsRegistry.getFunction("addRecipient").selector]);

    const result = easyTrack.addAddRecipientEvmScriptFactory(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, `Add add recipient EVM Script Factory "${input.name}"`);
    assert.isTrue(callStub.calledOnceWith(mockContracts.easyTrack.addEVMScriptFactory, [input.factory, permission]));
    assert.isTrue(eventStub.calledTwice);
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [input.factory, permission],
      }),
    );
  });

  it("addRemoveRecipientEvmScriptFactory works as expected", async () => {
    const mockContracts = {
      easyTrack: { addEVMScriptFactory: "0xaddEVMScriptFactory" },
      callsScript: {},
      voting: {},
    };
    const input = {
      factory: "0xFactoryAddress",
      name: "FactoryName",
      registry: "0xRegistryAddress",
    };

    const permission = bytes.join(
      ...[input.registry, iAllowedRecipientsRegistry.getFunction("removeRecipient").selector],
    );

    const result = easyTrack.addRemoveRecipientEvmScriptFactory(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, `Add remove recipient EVM Script Factory "${input.name}"`);
    assert.isTrue(callStub.calledOnceWith(mockContracts.easyTrack.addEVMScriptFactory, [input.factory, permission]));
    assert.isTrue(eventStub.calledTwice);
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.easyTrack, "EVMScriptFactoryAdded", {
        args: [input.factory, permission],
      }),
    );
  });

  it("adds multiple payment EVM script factories successfully", async () => {
    const mockContracts = {
      easyTrack: { addEVMScriptFactory: sinon.stub().resolves() },
      finance: {
        address: "0xFinanceAddress",
        newImmediatePayment: {
          fragment: {
            selector: "0xSelector",
          },
        },
      },
      callsScript: {},
      voting: {},
    };
    const input = {
      name: "FactoryName",
      registry: "0xRegistryAddress",
      factories: {
        topUp: "0xTopUpFactory",
        addRecipient: "0xAddRecipientFactory",
        removeRecipient: "0xRemoveRecipientFactory",
      },
    };

    const result = easyTrack.addPaymentEvmScriptFactories(mockContracts as unknown as Contracts<Lido>, input);

    assert.lengthOf(result, 3);
  });

  it("removes multiple payment EVM script factories successfully", async () => {
    const mockContracts = {
      easyTrack: { removeEVMScriptFactory: sinon.stub().resolves() },
      callsScript: {},
      voting: {},
    };
    const input = {
      name: "FactoryName",
      factories: {
        topUp: "0xTopUpFactory",
        addRecipient: "0xAddRecipientFactory",
        removeRecipient: "0xRemoveRecipientFactory",
      },
    };

    const result = easyTrack.removePaymentEvmScriptFactories(mockContracts as unknown as Contracts<Lido>, input);

    assert.lengthOf(result, 3);
  });
});
