import { Address } from "abitype";
import { assert } from "chai";
import { encodeAbiParameters, getAbiItem, Hex, Log, pad, toEventSelector } from "viem";

import { ERC20_ABI } from "../../abi/ERC20.abi";
import { contract } from "../../src/contracts";
import { LogCollector } from "../../src/omnibuses/log-collector";
import { event } from "../../src/omnibuses/event-helpers";

const TOKEN: Address = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const OTHER_TOKEN: Address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const HOLDER: Address = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const RECIPIENT: Address = "0xC1db28B3301331277e307FDCfF8DE28242A4486E";

const token = contract(ERC20_ABI, TOKEN);

const TRANSFER_TOPIC = toEventSelector(getAbiItem({ abi: ERC20_ABI, name: "Transfer" }));

function createTransferLog(value: bigint, logIndex: number, emitter: Address = TOKEN): Log {
  const topics: [Hex, Hex, Hex] = [TRANSFER_TOPIC, pad(HOLDER), pad(RECIPIENT)];

  return {
    address: emitter,
    topics,
    data: encodeAbiParameters([{ name: "value", type: "uint256" }], [value]),
    logIndex,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
    removed: false,
  };
}

function transferEvent(value: bigint, options: { allowMultiple?: boolean } = {}) {
  return event(token, "Transfer", [HOLDER, RECIPIENT, value], options);
}

describe("LogCollector", () => {
  it("consumes the logs matched by the expected events", () => {
    const collector = new LogCollector([createTransferLog(1n, 0), createTransferLog(2n, 1)]);

    collector.assertEvents([transferEvent(1n), transferEvent(2n)]);

    collector.assertNothingLeft();
  });

  it("fails when a log is left unexplained", () => {
    const collector = new LogCollector([createTransferLog(1n, 0), createTransferLog(2n, 1)]);

    collector.assertEvents([transferEvent(1n)]);

    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });

  it("fails when no event was checked at all", () => {
    const collector = new LogCollector([createTransferLog(1n, 0)]);

    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
  });

  it("continues from the logs left by the previous assertion", () => {
    const collector = new LogCollector([createTransferLog(1n, 0), createTransferLog(2n, 1)]);

    collector.assertEvents([transferEvent(1n)]);
    collector.assertEvents([transferEvent(2n)]);

    collector.assertNothingLeft();
  });

  it("fails on an argument the log doesn't carry", () => {
    const collector = new LogCollector([createTransferLog(1n, 0)]);

    assert.throws(() => collector.assertEvents([transferEvent(500n)]));
  });

  it("fails when the event was emitted by another contract", () => {
    const collector = new LogCollector([createTransferLog(1n, 0, OTHER_TOKEN)]);

    assert.throws(
      () => collector.assertEvents([transferEvent(1n)]),
      new RegExp(`Unexpected emitter.*${OTHER_TOKEN} != ${TOKEN}`, "i"),
    );
  });

  it("skips an optional event without consuming a log", () => {
    const collector = new LogCollector([createTransferLog(1n, 0)]);

    collector.assertEvents([
      event(token, "Approval", [HOLDER, RECIPIENT, 1n], { isOptional: true }),
      transferEvent(1n),
    ]);

    collector.assertNothingLeft();
  });

  it("matches an event allowed to be emitted multiple times with every log in a row", () => {
    const collector = new LogCollector([createTransferLog(1n, 0), createTransferLog(1n, 1)]);

    collector.assertEvents([transferEvent(1n, { allowMultiple: true })]);

    collector.assertNothingLeft();
  });

  it("fails when no log is left for an expected event", () => {
    const collector = new LogCollector([createTransferLog(1n, 0)]);

    assert.throws(() => collector.assertEvents([transferEvent(1n), transferEvent(2n)]), /No log left to match/);
  });
});
