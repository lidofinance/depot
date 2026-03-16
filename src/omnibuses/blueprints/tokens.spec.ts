import { assert } from "chai";
import { getLidoContracts } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { event } from "../omnibus";
import tokens from "./tokens";

function createCtx() {
  const contracts = getLidoContracts("mainnet");
  return {
    contracts,
    event,
    directCall: OmnibusDirectCall.createCallBuilder({ voting: contracts.voting, callsScript: contracts.callsScript }),
  } as any;
}

describe("tokens blueprints", () => {
  it("transfer creates newImmediatePayment call with explicit token", () => {
    const ctx = createCtx();
    const token = "0x1111111111111111111111111111111111111111";
    const to = "0x2222222222222222222222222222222222222222";
    const amount = 1000n;

    const call = tokens.transfer(ctx, {
      title: "Transfer Tokens",
      token,
      to,
      amount,
      comment: "Payment #1",
    });

    assert.equal(call.title, "Transfer Tokens");
    assert.equal(call.functionName, "newImmediatePayment");
    assert.deepEqual(call.args, [token, to, amount, "Payment #1"]);

    const events = call.getEventsFor("proposal");
    assert.deepEqual(
      events.map((e) => e.abi.name),
      ["NewPeriod", "NewTransaction", "Transfer", "VaultTransfer"],
    );

    const newTxEvent = events.find((e) => e.abi.name === "NewTransaction")!;
    assert.deepEqual(newTxEvent.args, [null, false, to, amount, "Payment #1"]);

    const transferEvent = events.find((e) => e.abi.name === "Transfer")!;
    assert.deepEqual(transferEvent.args, [ctx.contracts.agent.address, to, amount]);

    const vaultEvent = events.find((e) => e.abi.name === "VaultTransfer")!;
    assert.deepEqual(vaultEvent.args, [token, to, amount]);
  });

  it("transferLDO uses LDO address from contracts", () => {
    const ctx = createCtx();
    const to = "0x2222222222222222222222222222222222222222";
    const amount = 500n;

    const call = tokens.transferLDO(ctx, {
      title: "Transfer LDO",
      to,
      amount,
      comment: "Treasury payment",
    });

    assert.equal(call.functionName, "newImmediatePayment");
    assert.deepEqual(call.args, [ctx.contracts.ldo.address, to, amount, "Treasury payment"]);
  });
});
