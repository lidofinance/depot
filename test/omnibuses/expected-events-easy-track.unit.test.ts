import { assert } from "chai";
import { Address, encodeAbiParameters, encodeFunctionData, Hex, Log, toEventSelector } from "viem";

import { EasyTrack_ABI } from "../../abi/EasyTrack.abi";
import { EvmScriptParser } from "../../src/aragon-votes-tools";
import { contract } from "../../src/contracts";
import { expectedEvents } from "../../src/omnibuses/expected-events";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";
import { LogCollector } from "../../src/omnibuses/log-collector";
import { VoteCall } from "../../src/omnibuses/omnibus-types";
import { VoteEvents } from "../../src/omnibuses/vote-events";

const EASY_TRACK = "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea";
const FACTORY = "0x0000000000000000000000000000000000000101";
const OTHER_FACTORY = "0x0000000000000000000000000000000000000102";
const FINANCE = "0xb9e5CBB9CA5b0d659238807E84D0176930753d86";
const REGISTRY = "0x8d8b35cA51e7808098afF4918C21Ce428c943F89";
const ADD_RECIPIENT_PERMISSION = "0x8d8b35ca51e7808098aff4918c21ce428c943f89739b5384";
const REMOVE_RECIPIENT_PERMISSION = "0x8d8b35ca51e7808098aff4918c21ce428c943f8912a29198";
const TOP_UP_PERMISSION =
  "0xb9e5cbb9ca5b0d659238807e84d0176930753d86f63648468d8b35ca51e7808098aff4918c21ce428c943f8966671229";
const easyTrack = contract(EasyTrack_ABI, EASY_TRACK);
const governance = getGovernanceContracts("mainnet");

function log(emitter: Address, signature: string, data: Hex, indexedTopics: Hex[] = []): Log {
  return {
    address: emitter,
    topics: [toEventSelector(signature), ...indexedTopics],
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    logIndex: null,
    removed: false,
  };
}

function factoryAddedLog(permission: Hex, factory: Address = FACTORY, emitter: Address = EASY_TRACK): Log {
  return log(emitter, "EVMScriptFactoryAdded(address,bytes)", encodeAbiParameters([{ type: "bytes" }], [permission]), [
    encodeAbiParameters([{ type: "address" }], [factory]),
  ]);
}

function factoryRemovedLog(factory: Address = FACTORY): Log {
  return log(EASY_TRACK, "EVMScriptFactoryRemoved(address)", "0x", [
    encodeAbiParameters([{ type: "address" }], [factory]),
  ]);
}

function logScriptCall(): Log {
  return log(governance.voting.address, "LogScriptCall(address,address,address)", "0x", [
    encodeAbiParameters([{ type: "address" }], [governance.tokenManager.address]),
    encodeAbiParameters([{ type: "address" }], [governance.voting.address]),
    encodeAbiParameters([{ type: "address" }], [EASY_TRACK]),
  ]);
}

function voteTailLogs(evmScript: Hex): Log[] {
  return [
    log(
      governance.voting.address,
      "ScriptResult(address,bytes,bytes,bytes)",
      encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }], [evmScript, "0x", "0x"]),
      [encodeAbiParameters([{ type: "address" }], [governance.callsScript.address])],
    ),
    log(governance.voting.address, "ExecuteVote(uint256)", "0x", [encodeAbiParameters([{ type: "uint256" }], [204n])]),
  ];
}

describe("Easy Track event helpers", () => {
  it("requires the registered factory and its exact custom permissions", () => {
    const collector = new LogCollector([factoryAddedLog(ADD_RECIPIENT_PERMISSION)]);

    collector.assertEvents(
      expectedEvents.easyTrack.factoryAdded(easyTrack, {
        factory: FACTORY,
        permission: ADD_RECIPIENT_PERMISSION,
      }),
    );

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("checks the top-up permissions for Finance payment followed by registry spending", () => {
    const collector = new LogCollector([factoryAddedLog(TOP_UP_PERMISSION)]);

    collector.assertEvents(
      expectedEvents.easyTrack.topUpFactoryAdded(easyTrack, {
        factory: FACTORY,
        finance: FINANCE,
        registry: REGISTRY,
      }),
    );

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("checks the add-recipient selector on the requested registry", () => {
    const collector = new LogCollector([factoryAddedLog(ADD_RECIPIENT_PERMISSION)]);

    collector.assertEvents(
      expectedEvents.easyTrack.addRecipientFactoryAdded(easyTrack, {
        factory: FACTORY,
        registry: REGISTRY,
      }),
    );

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("checks the remove-recipient selector when registering a removal factory", () => {
    const collector = new LogCollector([factoryAddedLog(REMOVE_RECIPIENT_PERMISSION)]);

    collector.assertEvents(
      expectedEvents.easyTrack.removeRecipientFactoryAdded(easyTrack, {
        factory: FACTORY,
        registry: REGISTRY,
      }),
    );

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("requires the factory removed from Easy Track", () => {
    const collector = new LogCollector([factoryRemovedLog()]);

    collector.assertEvents(expectedEvents.easyTrack.factoryRemoved(easyTrack, { factory: FACTORY }));

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });

  it("rejects an added event for a different factory", () => {
    const collector = new LogCollector([factoryAddedLog(TOP_UP_PERMISSION, OTHER_FACTORY)]);

    assert.throws(
      () =>
        collector.assertEvents(
          expectedEvents.easyTrack.topUpFactoryAdded(easyTrack, {
            factory: FACTORY,
            finance: FINANCE,
            registry: REGISTRY,
          }),
        ),
      /args mismatch/,
    );
  });

  it("rejects registration with permissions for a different action", () => {
    const collector = new LogCollector([factoryAddedLog(REMOVE_RECIPIENT_PERMISSION)]);

    assert.throws(
      () =>
        collector.assertEvents(
          expectedEvents.easyTrack.addRecipientFactoryAdded(easyTrack, {
            factory: FACTORY,
            registry: REGISTRY,
          }),
        ),
      /args mismatch/,
    );
  });

  it("rejects a matching registration emitted by another contract", () => {
    const collector = new LogCollector([factoryAddedLog(ADD_RECIPIENT_PERMISSION, FACTORY, REGISTRY)]);

    assert.throws(
      () =>
        collector.assertEvents(
          expectedEvents.easyTrack.factoryAdded(easyTrack, {
            factory: FACTORY,
            permission: ADD_RECIPIENT_PERMISSION,
          }),
        ),
      /Unexpected emitter/,
    );
  });

  it("rejects removal of a different factory", () => {
    const collector = new LogCollector([factoryRemovedLog(OTHER_FACTORY)]);

    assert.throws(
      () =>
        collector.assertEvents(
          expectedEvents.easyTrack.factoryRemoved(easyTrack, {
            factory: FACTORY,
          }),
        ),
      /args mismatch/,
    );
  });

  it("leaves unknown events for the strict receipt assertion", () => {
    const collector = new LogCollector([
      factoryAddedLog(ADD_RECIPIENT_PERMISSION),
      log(EASY_TRACK, "UnrecognizedEvent(uint256)", encodeAbiParameters([{ type: "uint256" }], [1n])),
    ]);

    collector.assertEvents(
      expectedEvents.easyTrack.addRecipientFactoryAdded(easyTrack, {
        factory: FACTORY,
        registry: REGISTRY,
      }),
    );

    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });

  it("matches registration and removal by vote item title despite their shared Easy Track target", () => {
    const calls: VoteCall[] = [
      {
        title: "Register top-up factory",
        target: EASY_TRACK,
        payload: encodeFunctionData({
          abi: EasyTrack_ABI,
          functionName: "addEVMScriptFactory",
          args: [FACTORY, TOP_UP_PERMISSION],
        }),
      },
      {
        title: "Remove obsolete factory",
        target: EASY_TRACK,
        payload: encodeFunctionData({
          abi: EasyTrack_ABI,
          functionName: "removeEVMScriptFactory",
          args: [OTHER_FACTORY],
        }),
      },
    ];
    const evmScript = EvmScriptParser.encode(calls.map((call) => ({ address: call.target, calldata: call.payload })));
    const collector = new LogCollector([
      logScriptCall(),
      factoryAddedLog(TOP_UP_PERMISSION),
      logScriptCall(),
      factoryRemovedLog(OTHER_FACTORY),
      ...voteTailLogs(evmScript),
    ]);
    const voteEvents = new VoteEvents(collector, calls, governance, evmScript);

    voteEvents.item(
      "Remove obsolete factory",
      expectedEvents.easyTrack.factoryRemoved(easyTrack, { factory: OTHER_FACTORY }),
    );
    voteEvents.item(
      "Register top-up factory",
      expectedEvents.easyTrack.topUpFactoryAdded(easyTrack, {
        factory: FACTORY,
        finance: FINANCE,
        registry: REGISTRY,
      }),
    );
    voteEvents.assertTail();

    assert.doesNotThrow(() => collector.assertNothingLeft());
  });
});
