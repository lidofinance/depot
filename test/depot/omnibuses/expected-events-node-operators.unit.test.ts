import { assert } from "chai";
import { Log } from "viem";

import { NodeOperatorsRegistry_ABI } from "../../../abi/NodeOperatorsRegistry.abi";
import { contract } from "../../../src/contracts";
import events from "../../../src/omnibuses/expected-events/node-operators";
import { LogCollector } from "../../../src/omnibuses/log-collector";
import { eventLog } from "../helpers/event-log";

const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const REWARD = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
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
  it("matches name and reward address changes", () => {
    const collector = new LogCollector([
      eventLog(registry, "NodeOperatorNameSet", [OPERATOR_ID, "New name"]),
      eventLog(registry, "NodeOperatorRewardAddressSet", [OPERATOR_ID, REWARD]),
    ]);
    collector.assertEvents(events.nameSet(registry, { nodeOperatorId: OPERATOR_ID, name: "New name" }));
    collector.assertEvents(events.rewardAddressSet(registry, { nodeOperatorId: OPERATOR_ID, rewardAddress: REWARD }));
    collector.assertNothingLeft();
  });

  it("matches deactivation and both mandatory nonce events", () => {
    const collector = new LogCollector([activeLog(), ...nonceLogs()]);
    collector.assertEvents(events.activeSet(registry, { nodeOperatorId: OPERATOR_ID, active: false, nonce: NONCE }));
    collector.assertNothingLeft();
  });

  it("matches the vetted keys reset between deactivation and nonce events", () => {
    const collector = new LogCollector([
      activeLog(),
      eventLog(registry, "VettedSigningKeysCountChanged", [OPERATOR_ID, 80n]),
      ...nonceLogs(),
    ]);
    collector.assertEvents(
      events.activeSet(registry, {
        nodeOperatorId: OPERATOR_ID,
        active: false,
        nonce: NONCE,
        vettedSigningKeysCount: 80n,
      }),
    );
    collector.assertNothingLeft();
  });

  it("matches the target count, mode and nonce", () => {
    const collector = new LogCollector([targetLog(), ...nonceLogs()]);
    collector.assertEvents(
      events.targetValidatorsCountChanged(registry, {
        nodeOperatorId: OPERATOR_ID,
        targetValidatorsCount: 100n,
        targetLimitMode: 2n,
        nonce: NONCE,
      }),
    );
    collector.assertNothingLeft();
  });

  for (const mismatch of [
    { nodeOperatorId: 22n },
    { targetValidatorsCount: 101n },
    { targetLimitMode: 1n },
    { nonce: 11n },
  ]) {
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
