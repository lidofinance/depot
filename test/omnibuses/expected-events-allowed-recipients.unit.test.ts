import { assert } from "chai";
import { encodeAbiParameters, Hex, Log, toEventSelector, toHex } from "viem";

import { AllowedRecipientsRegistry_ABI } from "../../abi/AllowedRecipientsRegistry.abi";
import { contract } from "../../src/contracts";
import allowedRecipients from "../../src/omnibuses/expected-events/allowed-recipients";
import { LogCollector } from "../../src/omnibuses/log-collector";

const REGISTRY = "0x8d8b35cA51e7808098afF4918C21Ce428c943F89";
const RECIPIENT = "0xAA568141c051f2D1132b110f8391F18D48E8D889";
const registry = contract(AllowedRecipientsRegistry_ABI, REGISTRY);
const PERIOD_START = 1_780_272_000n;

function log(signature: string, data: Hex, indexed: Hex[] = []): Log {
  return {
    address: REGISTRY,
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

describe("allowed-recipient event helpers", () => {
  it("checks the period boundary before the new spending limit", () => {
    const collector = new LogCollector([
      log("CurrentPeriodAdvanced(uint256)", "0x", [toHex(PERIOD_START, { size: 32 })]),
      log(
        "LimitsParametersChanged(uint256,uint256)",
        encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1000n, 3n]),
      ),
    ]);

    collector.assertEvents(
      allowedRecipients.limitsParametersChanged(registry, {
        limit: 1000n,
        periodDurationMonths: 3n,
        periodStart: PERIOD_START,
      }),
    );
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("requires the new spent amount when it changes", () => {
    const collector = new LogCollector([
      log("SpentAmountChanged(uint256)", encodeAbiParameters([{ type: "uint256" }], [0n])),
    ]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 100n, spentAmount: 0n }),
    );
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("expects no event when setting the already stored spent amount", () => {
    const collector = new LogCollector([]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 0n, spentAmount: 0n }),
    );
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("checks both the added recipient and its registry title", () => {
    const collector = new LogCollector([
      log("RecipientAdded(address,string)", encodeAbiParameters([{ type: "string" }], ["Buyback Allocator"]), [
        encodeAbiParameters([{ type: "address" }], [RECIPIENT]),
      ]),
    ]);

    collector.assertEvents(
      allowedRecipients.recipientAdded(registry, { recipient: RECIPIENT, title: "Buyback Allocator" }),
    );
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("rejects a limit update without the mandatory period event", () => {
    const collector = new LogCollector([
      log(
        "LimitsParametersChanged(uint256,uint256)",
        encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1000n, 3n]),
      ),
    ]);
    assert.throws(
      () =>
        collector.assertEvents(
          allowedRecipients.limitsParametersChanged(registry, {
            limit: 1000n,
            periodDurationMonths: 3n,
            periodStart: PERIOD_START,
          }),
        ),
      /Unexpected log/,
    );
  });

  it("rejects a changed amount when the registry emitted a different value", () => {
    const collector = new LogCollector([
      log("SpentAmountChanged(uint256)", encodeAbiParameters([{ type: "uint256" }], [1n])),
    ]);
    assert.throws(
      () =>
        collector.assertEvents(
          allowedRecipients.spentAmountChanged(registry, {
            previousSpentAmount: 100n,
            spentAmount: 0n,
          }),
        ),
      /args mismatch/,
    );
  });

  it("does not consume a spent-amount event for a no-op", () => {
    const collector = new LogCollector([
      log("SpentAmountChanged(uint256)", encodeAbiParameters([{ type: "uint256" }], [0n])),
    ]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 0n, spentAmount: 0n }),
    );
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });
});
