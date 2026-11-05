import { assert } from "chai";

import { AllowedRecipientsRegistry_ABI } from "@/abi/AllowedRecipientsRegistry.abi";
import { contract } from "@/src/contracts";
import allowedRecipients from "@/src/omnibuses/expected-events/allowed-recipients";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const REGISTRY = "0x8d8b35cA51e7808098afF4918C21Ce428c943F89";
const registry = contract(AllowedRecipientsRegistry_ABI, REGISTRY);

describe("allowed-recipient event helpers", () => {
  it("does not consume a spent-amount event for a no-op", () => {
    const collector = new LogCollector([eventLog(registry, "SpentAmountChanged", [0n])]);

    collector.assertEvents(
      allowedRecipients.spentAmountChanged(registry, { previousSpentAmount: 0n, spentAmount: 0n }),
    );
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });
});
