import { Address } from "abitype";
import { assert } from "chai";
import { Log } from "viem";

import { ERC20_ABI } from "@/abi/ERC20.abi";
import { contract } from "@/src/contracts";
import { LogCollector } from "@/src/omnibuses/log-collector";
import { event } from "@/src/omnibuses/event-helpers";
import { eventLog } from "../helpers/event-log";

const TOKEN: Address = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const OTHER_TOKEN: Address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const HOLDER: Address = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const RECIPIENT: Address = "0xC1db28B3301331277e307FDCfF8DE28242A4486E";

const token = contract(ERC20_ABI, TOKEN);

function createTransferLog(value: bigint, logIndex: number, emitter: Address = TOKEN): Log {
  return eventLog(token, "Transfer", [HOLDER, RECIPIENT, value], {
    address: emitter,
    logIndex: logIndex,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
  });
}

function createApprovalLog(value: bigint, logIndex: number): Log {
  return eventLog(token, "Approval", [HOLDER, RECIPIENT, value], {
    logIndex: logIndex,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
  });
}

function transferEvent(value: bigint, options: { allowMultiple?: boolean } = {}) {
  return event(token, "Transfer", [HOLDER, RECIPIENT, value], options);
}

describe("LogCollector", () => {
  it("fails when a log is left unexplained", () => {
    const collector = new LogCollector([createTransferLog(1n, 0), createTransferLog(2n, 1)]);

    collector.assertEvents([transferEvent(1n)]);

    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(1\)/);
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

  it("requires the first match of a repeated event", () => {
    const collector = new LogCollector([createApprovalLog(1n, 0)]);

    assert.throws(
      () =>
        collector.assertEvents([
          transferEvent(1n, { allowMultiple: true }),
          event(token, "Approval", [HOLDER, RECIPIENT, 1n]),
        ]),
      /Unexpected log for/,
    );
    assert.throws(
      () => new LogCollector([]).assertEvents([transferEvent(1n, { allowMultiple: true })]),
      /No log left to match/,
    );
  });
});
