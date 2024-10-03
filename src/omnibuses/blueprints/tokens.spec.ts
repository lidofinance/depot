import tokens from "./tokens";
import { Contracts } from "../../contracts/contracts";
import { Lido } from "../../../configs/types";
import { assert } from "../../common/assert";
import sinon from "sinon";
import * as voteScripts from "../../votes/vote-script";
import * as voteEvents from "../../votes/events";
import { ERC20__factory } from "../../../typechain-types/factories/interfaces";

describe("Tokens actions tests", () => {
  let callStub: sinon.SinonStub;
  let eventStub: sinon.SinonStub;
  beforeEach(() => {
    callStub = sinon.stub(voteScripts, "call");
    eventStub = sinon.stub(voteEvents, "event");
  });
  afterEach(() => {
    sinon.restore();
  });

  it("transfers tokens successfully", async () => {
    const mockContracts = {
      agent: { address: "0xAgentAddress" },
      finance: { newImmediatePayment: sinon.stub().resolves() },
      callsScript: {},
      voting: {},
      ldo: { address: "0xLdoAddress" },
    };
    const input = {
      title: "Transfer Tokens",
      to: "0xRecipientAddress",
      amount: "1000",
      token: "0xTokenAddress",
    };
    sinon.stub(ERC20__factory, "connect").returns(input.token as any);

    const result = tokens.transfer(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, input.title);
    assert.isTrue(eventStub.callCount === 5);
    assert.isTrue(
      callStub.calledOnceWith(mockContracts.finance.newImmediatePayment, [
        input.token,
        input.to,
        input.amount,
        input.title,
      ]),
    );
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.finance, "NewTransaction", {
        args: [undefined, false, input.to, input.amount, input.title],
      }),
    );
    assert.isTrue(
      eventStub.calledWith(input.token, "Transfer", { args: [mockContracts.agent, input.to, input.amount] }),
    );
    assert.isTrue(
      eventStub.calledWith(mockContracts.agent, "VaultTransfer", { args: [input.token, input.to, input.amount] }),
    );
    assert.isTrue(eventStub.calledWith(mockContracts.finance, "NewPeriod", undefined, { optional: true }));
  });

  it("transfers LDO tokens successfully", async () => {
    const mockContracts = {
      agent: { address: "0xAgentAddress" },
      finance: { newImmediatePayment: sinon.stub().resolves() },
      callsScript: {},
      voting: {},
      ldo: { address: "0xLdoAddress" },
    };
    const input = {
      title: "Transfer Tokens",
      to: "0xRecipientAddress",
      amount: "1000",
    };

    const result = tokens.transferLDO(mockContracts as unknown as Contracts<Lido>, input);

    assert.equal(result.title, input.title);
    assert.isTrue(eventStub.callCount === 5);
    assert.isTrue(
      callStub.calledOnceWith(mockContracts.finance.newImmediatePayment, [
        mockContracts.ldo,
        input.to,
        input.amount,
        input.title,
      ]),
    );
    assert.isTrue(eventStub.calledWith(mockContracts.callsScript, "LogScriptCall", { emitter: mockContracts.voting }));
    assert.isTrue(
      eventStub.calledWith(mockContracts.finance, "NewTransaction", {
        args: [undefined, false, input.to, input.amount, input.title],
      }),
    );
    assert.isTrue(
      eventStub.calledWith(mockContracts.ldo, "Transfer", { args: [mockContracts.agent, input.to, input.amount] }),
    );
    assert.isTrue(
      eventStub.calledWith(mockContracts.agent, "VaultTransfer", { args: [mockContracts.ldo, input.to, input.amount] }),
    );
    assert.isTrue(eventStub.calledWith(mockContracts.finance, "NewPeriod", undefined, { optional: true }));
  });
});
