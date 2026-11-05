import { assert } from "chai";
import { Log } from "viem";

import { Agent_ABI } from "@/abi/Agent.abi";
import { ERC20_ABI } from "@/abi/ERC20.abi";
import { Finance_ABI } from "@/abi/Finance.abi";
import { contract } from "@/src/contracts";
import financeEvents from "@/src/omnibuses/expected-events/finance";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const FINANCE = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";
const VAULT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const TOKEN = "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfebb0";
const RECIPIENT = "0x95B521B4F55a447DB89f6a27f951713fC2035f3F";
const finance = contract(Finance_ABI, FINANCE);
const vault = contract(Agent_ABI, VAULT);
const token = contract(ERC20_ABI, TOKEN);
const payment = { recipient: RECIPIENT, amount: 2500n, reference: "Operational payment" } as const;

function paymentLogs(): Log[] {
  return [
    eventLog(finance, "NewTransaction", [200n, false, RECIPIENT, 2500n, "Operational payment"]),
    eventLog(token, "Transfer", [VAULT, RECIPIENT, 2500n]),
    eventLog(vault, "VaultTransfer", [TOKEN.toLowerCase(), RECIPIENT, 2500n]),
  ];
}

describe("finance event helpers", () => {
  it("accounts for every Finance period advanced before the payment", () => {
    const collector = new LogCollector([
      eventLog(finance, "NewPeriod", [1n, 100n, 200n]),
      eventLog(finance, "NewPeriod", [2n, 201n, 300n]),
      ...paymentLogs(),
    ]);

    collector.assertEvents(financeEvents.tokenPaid({ finance, vault, token }, payment));
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });
});
