import { assert } from "chai";

import { AllowedRecipientsRegistry_ABI } from "@/abi/AllowedRecipientsRegistry.abi";
import { contract } from "@/src/contracts";
import allowedRecipients from "@/src/omnibuses/expected-events/allowed-recipients";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const REGISTRY = "0x8d8b35cA51e7808098afF4918C21Ce428c943F89";
const registry = contract(AllowedRecipientsRegistry_ABI, REGISTRY);
const PERIOD_START = 1_780_272_000n;

describe("allowed-recipient event helpers", () => {
  it("expects no event when setting the already stored spent amount", () => {
    const collector = new LogCollector([]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 0n, spentAmount: 0n }),
    );
    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("rejects a limit update without the mandatory period event", () => {
    const collector = new LogCollector([eventLog(registry, "LimitsParametersChanged", [1000n, 3n])]);
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
    const collector = new LogCollector([eventLog(registry, "SpentAmountChanged", [1n])]);
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
    const collector = new LogCollector([eventLog(registry, "SpentAmountChanged", [0n])]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 0n, spentAmount: 0n }),
    );
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });
});
