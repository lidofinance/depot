import { assert } from "chai";
import { contract } from "../../../src/contracts";
import { getGovernanceContracts } from "../../../src/omnibuses/governance-contracts";
import { OmnibusDirectCallFactory } from "../../../src/omnibuses/calls/omnibus-direct-call";
import { event, BlueprintCtx } from "../../../src/omnibuses/omnibus";
import { Agent_ABI } from "../../../abi/Agent.abi";
import { Finance_ABI } from "../../../abi/Finance.abi";
import tokens from "../../../src/omnibuses/blueprints/tokens";

function createCtx(): BlueprintCtx {
  const { voting, callsScript } = getGovernanceContracts("mainnet");
  const factory = new OmnibusDirectCallFactory(voting, callsScript);
  return {
    event,
    directCall: factory.create.bind(factory),
  };
}

const agent = contract(Agent_ABI, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c");
const finance = contract(Finance_ABI, "0xB9E5CBB9CA5b0d659238807E84D0176930753d86");

describe("tokens blueprints", () => {
  it("transfer creates newImmediatePayment call with explicit token", () => {
    const ctx = createCtx();
    const token = "0x1111111111111111111111111111111111111111";
    const to = "0x2222222222222222222222222222222222222222";
    const amount = 1000n;

    const call = tokens.transfer(
      ctx,
      { agent, finance },
      {
        title: "Transfer Tokens",
        token,
        to,
        amount,
        comment: "Payment #1",
      },
    );

    assert.equal(call.title, "Transfer Tokens");
    assert.equal(call.input.fn, "newImmediatePayment");
    assert.deepEqual(call.input.args, [token, to, amount, "Payment #1"]);

    const events = call.getExpectedEvents("proposal");
    const eventNames = events.map((e) => e.abi.name);
    assert.includeMembers(eventNames, ["NewPeriod", "NewTransaction", "Transfer", "VaultTransfer"]);

    const newTxEvent = events.find((e) => e.abi.name === "NewTransaction")!;
    assert.deepEqual(newTxEvent.args, [null, false, to, amount, "Payment #1"]);

    const transferEvent = events.find((e) => e.abi.name === "Transfer")!;
    assert.deepEqual(transferEvent.args, [agent.address, to, amount]);

    const vaultEvent = events.find((e) => e.abi.name === "VaultTransfer")!;
    assert.deepEqual(vaultEvent.args, [token, to, amount]);
  });
});
