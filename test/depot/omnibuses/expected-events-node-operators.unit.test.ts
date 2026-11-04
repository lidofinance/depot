import { assert } from "chai";
import { Log } from "viem";

import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { contract } from "@/src/contracts";
import events from "@/src/omnibuses/expected-events/node-operators";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const registry = contract(NodeOperatorsRegistry_ABI, REGISTRY);
const OPERATOR_ID = 21n;
const NONCE = 10n;

function nonceLogs(): Log[] {
  return [eventLog(registry, "KeysOpIndexSet", [NONCE]), eventLog(registry, "NonceChanged", [NONCE])];
}

function activeLog(): Log {
  return eventLog(registry, "NodeOperatorActiveSet", [OPERATOR_ID, false]);
}

function targetLog(): Log {
  return eventLog(registry, "TargetValidatorsCountChanged", [OPERATOR_ID, 100n, 2n]);
}

describe("node operator event helpers", () => {
  for (const mismatch of [{ nodeOperatorId: 22n }, { nonce: 11n }]) {
    it(`rejects an incorrect ${Object.keys(mismatch)[0]}`, () => {
      const collector = new LogCollector([targetLog(), ...nonceLogs()]);
      assert.throws(
        () =>
          collector.assertEvents(
            events.targetValidatorsCountChanged(registry, {
              nodeOperatorId: OPERATOR_ID,
              targetValidatorsCount: 100n,
              targetLimitMode: 2n,
              nonce: NONCE,
              ...mismatch,
            }),
          ),
        /args mismatch/,
      );
    });
  }

  it("rejects a missing nonce event and undeclared extra logs", () => {
    const expected = events.activeSet(registry, { nodeOperatorId: OPERATOR_ID, active: false, nonce: NONCE });
    assert.throws(() => new LogCollector([activeLog(), nonceLogs()[0]]).assertEvents(expected), /No log left/);
    const collector = new LogCollector([activeLog(), ...nonceLogs(), activeLog()]);
    collector.assertEvents(expected);
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left/);
  });
});
