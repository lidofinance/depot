import { assert } from "chai";
import { Address, Hex, Log, toEventSelector } from "viem";

import { Agent_ABI } from "../../abi/Agent.abi";
import { ERC20_ABI } from "../../abi/ERC20.abi";
import { Finance_ABI } from "../../abi/Finance.abi";
import { Lido_ABI } from "../../abi/Lido.abi";
import { contract } from "../../src/contracts";
import financeEvents from "../../src/omnibuses/expected-events/finance";
import { LogCollector } from "../../src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const FINANCE = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";
const VAULT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const TOKEN = "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfebb0";
const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const RECIPIENT = "0x95B521B4F55a447DB89f6a27f951713fC2035f3F";
const finance = contract(Finance_ABI, FINANCE);
const vault = contract(Agent_ABI, VAULT);
const token = contract(ERC20_ABI, TOKEN);
const steth = contract(Lido_ABI, STETH);
const payment = { recipient: RECIPIENT, amount: 2500n, reference: "Operational payment" } as const;

function log(address: Address, signature: string, data: Hex, indexed: Hex[] = []): Log {
  return {
    address,
    topics: [toEventSelector(signature), ...indexed],
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    logIndex: null,
    removed: false,
  };
}

function paymentLogs(tokenAddress: Address = TOKEN): Log[] {
  return [
    eventLog(finance, "NewTransaction", [200n, false, RECIPIENT, 2500n, "Operational payment"]),
    eventLog(token, "Transfer", [VAULT, RECIPIENT, 2500n], { address: tokenAddress }),
    eventLog(vault, "VaultTransfer", [tokenAddress.toLowerCase(), RECIPIENT, 2500n]),
  ];
}

describe("finance event helpers", () => {
  it("matches the payment, token transfer and vault transfer in order", () => {
    const collector = new LogCollector(paymentLogs());

    collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, payment));
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("accounts for every Finance period advanced before the payment", () => {
    const collector = new LogCollector([
      eventLog(finance, "NewPeriod", [1n, 100n, 200n]),
      eventLog(finance, "NewPeriod", [2n, 201n, 300n]),
      ...paymentLogs(),
    ]);

    collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, payment));
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("checks the exact stETH shares transferred before VaultTransfer", () => {
    const logs = paymentLogs(STETH);
    logs.splice(2, 0, eventLog(steth, "TransferShares", [VAULT, RECIPIENT, 2000n]));
    const collector = new LogCollector(logs);

    collector.assertEvents(financeEvents.stethPaid({ finance, vault, steth }, { ...payment, shares: 2000n }));
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  for (const mismatch of [
    { name: "recipient", input: { ...payment, recipient: VAULT } },
    { name: "amount", input: { ...payment, amount: 2501n } },
    { name: "reference", input: { ...payment, reference: "Different payment" } },
  ] as const) {
    it(`rejects an incorrect payment ${mismatch.name}`, () => {
      const collector = new LogCollector(paymentLogs());
      assert.throws(
        () => collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, mismatch.input)),
        /args mismatch/,
      );
    });
  }

  it("rejects a transfer emitted by a different token", () => {
    const collector = new LogCollector(paymentLogs(STETH));
    assert.throws(
      () => collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, payment)),
      /Unexpected emitter/,
    );
  });

  it("requires TransferShares for a stETH payout", () => {
    const collector = new LogCollector(paymentLogs(STETH));
    assert.throws(
      () => collector.assertEvents(financeEvents.stethPaid({ finance, vault, steth }, { ...payment, shares: 2000n })),
      /Unexpected emitter/,
    );
  });

  it("rejects an incorrect stETH share amount", () => {
    const logs = paymentLogs(STETH);
    logs.splice(2, 0, eventLog(steth, "TransferShares", [VAULT, RECIPIENT, 1999n]));
    const collector = new LogCollector(logs);
    assert.throws(
      () => collector.assertEvents(financeEvents.stethPaid({ finance, vault, steth }, { ...payment, shares: 2000n })),
      /args mismatch/,
    );
  });

  it("leaves an additional event for the strict final check", () => {
    const collector = new LogCollector([...paymentLogs(), log(FINANCE, "UnexpectedPaymentEvent()", "0x")]);

    collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, payment));
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });
});
