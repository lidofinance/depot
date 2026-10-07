import { assert } from "chai";
import { encodeAbiParameters, Hex, Log, pad, toEventSelector, toHex } from "viem";

import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { contract } from "../../src/contracts";
import events from "../../src/omnibuses/expected-events/node-operators";
import { LogCollector } from "../../src/omnibuses/log-collector";

const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const REWARD = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const registry = contract(NodeOperatorsRegistry_ABI, REGISTRY);
const OPERATOR_ID = 21n;
const NONCE = 10n;

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

function nonceLogs(): Log[] {
  return [
    log("KeysOpIndexSet(uint256)", toHex(NONCE, { size: 32 })),
    log("NonceChanged(uint256)", toHex(NONCE, { size: 32 })),
  ];
}

function activeLog(): Log {
  return log("NodeOperatorActiveSet(uint256,bool)", encodeAbiParameters([{ type: "bool" }], [false]), [
    toHex(OPERATOR_ID, { size: 32 }),
  ]);
}

function targetLog(): Log {
  return log(
    "TargetValidatorsCountChanged(uint256,uint256,uint256)",
    encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [100n, 2n]),
    [toHex(OPERATOR_ID, { size: 32 })],
  );
}

describe("node operator event helpers", () => {
  it("matches name and reward address changes", () => {
    const collector = new LogCollector([
      log("NodeOperatorNameSet(uint256,string)", encodeAbiParameters([{ type: "string" }], ["New name"]), [
        toHex(OPERATOR_ID, { size: 32 }),
      ]),
      log("NodeOperatorRewardAddressSet(uint256,address)", pad(REWARD), [toHex(OPERATOR_ID, { size: 32 })]),
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
      log("VettedSigningKeysCountChanged(uint256,uint256)", toHex(80n, { size: 32 }), [
        toHex(OPERATOR_ID, { size: 32 }),
      ]),
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
