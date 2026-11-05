import { assert } from "chai";

import { EasyTrack_ABI } from "@/abi/EasyTrack.abi";
import { contract } from "@/src/contracts";
import { expectedEvents } from "@/src/omnibuses/expected-events";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const EASY_TRACK = "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea";
const FACTORY = "0x0000000000000000000000000000000000000101";
const FINANCE = "0xb9e5CBB9CA5b0d659238807E84D0176930753d86";
const REGISTRY = "0x8d8b35cA51e7808098afF4918C21Ce428c943F89";
const TOP_UP_PERMISSION =
  "0xb9e5cbb9ca5b0d659238807e84d0176930753d86f63648468d8b35ca51e7808098aff4918c21ce428c943f8966671229";
const easyTrack = contract(EasyTrack_ABI, EASY_TRACK);

describe("Easy Track event helpers", () => {
  it("checks the top-up permissions for Finance payment followed by registry spending", () => {
    const collector = new LogCollector([eventLog(easyTrack, "EVMScriptFactoryAdded", [FACTORY, TOP_UP_PERMISSION])]);

    collector.assertEvents(
      expectedEvents.easyTrack.topUpFactoryAdded(easyTrack, {
        factory: FACTORY,
        finance: FINANCE,
        registry: REGISTRY,
      }),
    );

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });
});
