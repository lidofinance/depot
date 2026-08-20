import { Address } from "abitype";
import { assert } from "chai";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, Hex, Log } from "viem";

import { ERC20_ABI } from "../../abi/ERC20.abi";
import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import { StakingRouter_ABI } from "../../abi/StakingRouter.abi";
import bytes, { HexStrPrefixed } from "../../src/common/bytes";
import { contract, Contract } from "../../src/contracts";
import { EvmScriptParser } from "../../src/aragon-votes-tools";
import { event } from "../../src/omnibuses/event-helpers";
import { expectedEvents } from "../../src/omnibuses/expected-events";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";
import { LogCollector } from "../../src/omnibuses/log-collector";
import { VoteCall } from "../../src/omnibuses/omnibus-types";
import { ProposalEvents, VoteEvents } from "../../src/omnibuses/vote-events";

const governance = getGovernanceContracts("mainnet");
const { voting, callsScript, timelock, dualGovernance, adminExecutor } = governance;

const STAKING_ROUTER: Address = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const LDO: Address = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const RECIPIENT: Address = "0xC1db28B3301331277e307FDCfF8DE28242A4486E";
const SENDER: Address = "0x0000000000000000000000000000000000000001";

const stakingRouter = contract(StakingRouter_ABI, STAKING_ROUTER);
const ldo = contract(ERC20_ABI, LDO);

let logIndex = 0;

/** Encodes a log the way the node would: indexed args into topics, the rest into data. */
function log(emitter: Contract, eventName: string, args: unknown[], address?: Address): Log {
  const abiEvent = emitter.abi.find((item) => item.type === "event" && item.name === eventName);
  if (!abiEvent || abiEvent.type !== "event") {
    throw new Error(`No event "${eventName}" in ${emitter.label} ABI`);
  }
  const indexedArgs = abiEvent.inputs.flatMap((input, index) => (input.indexed ? [args[index]] : []));
  const plainInputs = abiEvent.inputs.filter((input) => !input.indexed);
  const plainArgs = abiEvent.inputs.flatMap((input, index) => (input.indexed ? [] : [args[index]]));

  return {
    address: address ?? emitter.address,
    topics: encodeEventTopics({ abi: [abiEvent], eventName: abiEvent.name, args: indexedArgs as never }) as [
      Hex,
      ...Hex[],
    ],
    data: encodeAbiParameters(plainInputs, plainArgs),
    logIndex: logIndex++,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
    removed: false,
  };
}

function logScriptCall(target: Address): Log {
  return log(callsScript, "LogScriptCall", [SENDER, voting.address, target], voting.address);
}

function voteCall(title: string, target: Address, payload: HexStrPrefixed = "0x12345678"): VoteCall {
  return { title, target, payload };
}

const UPDATE_SHARES = {
  stakingModuleId: 1n,
  stakeShareLimit: 500n,
  priorityExitShareThreshold: 550n,
};

function updateSharesLog(): Log {
  return log(stakingRouter, "StakingModuleShareLimitSet", [1n, 500n, 550n, SENDER]);
}

describe("VoteEvents", () => {
  beforeEach(() => {
    logIndex = 0;
  });

  const calls = [voteCall("Update staking module 1", STAKING_ROUTER), voteCall("Transfer LDO", LDO)];
  const evmScript = EvmScriptParser.encode(calls.map((call) => ({ address: call.target, calldata: call.payload })));

  function voteLogs(): Log[] {
    return [
      logScriptCall(STAKING_ROUTER),
      updateSharesLog(),
      logScriptCall(LDO),
      log(ldo, "Transfer", [SENDER, RECIPIENT, 10n]),
      log(voting, "ScriptResult", [callsScript.address, evmScript, "0x", "0x"]),
      log(voting, "ExecuteVote", [1n]),
    ];
  }

  it("asserts items by title in any order and the core asserts the tail", () => {
    const collector = new LogCollector(voteLogs());
    const voteEvents = new VoteEvents(collector, calls, governance, evmScript);

    voteEvents.item("Transfer LDO", [event(ldo, "Transfer", [SENDER, RECIPIENT, 10n])]);
    voteEvents.item(
      "Update staking module 1",
      expectedEvents.stakingRouter.moduleSharesUpdated(stakingRouter, UPDATE_SHARES),
    );
    voteEvents.assertTail();

    collector.assertNothingLeft();
  });

  it("leaves the logs of an item the test did not address", () => {
    const collector = new LogCollector(voteLogs());
    const voteEvents = new VoteEvents(collector, calls, governance, evmScript);

    voteEvents.item("Transfer LDO", [event(ldo, "Transfer", [SENDER, RECIPIENT, 10n])]);
    voteEvents.assertTail();

    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left \(2\)/);
  });

  it("fails on a domain event the item did not emit", () => {
    const voteEvents = new VoteEvents(new LogCollector(voteLogs()), calls, governance, evmScript);

    assert.throws(() =>
      voteEvents.item("Transfer LDO", [
        event(ldo, "Transfer", [SENDER, RECIPIENT, 10n]),
        event(ldo, "Approval", [SENDER, RECIPIENT, 1n]),
      ]),
    );
  });

  it("does not let an item consume the logs of its neighbour", () => {
    const voteEvents = new VoteEvents(new LogCollector(voteLogs()), calls, governance, evmScript);

    assert.throws(() =>
      voteEvents.item("Transfer LDO", [event(stakingRouter, "StakingModuleShareLimitSet", [1n, 500n, 550n, null])]),
    );
  });

  it("names the known items when the title is unknown", () => {
    const voteEvents = new VoteEvents(new LogCollector(voteLogs()), calls, governance, evmScript);

    assert.throws(
      () => voteEvents.item("Nope"),
      /no item titled "Nope"[\s\S]*0\. Update staking module 1[\s\S]*1\. Transfer LDO/,
    );
  });

  it("asks for itemAt when the title repeats", () => {
    const repeated = [voteCall("Same", STAKING_ROUTER), voteCall("Same", LDO)];
    const voteEvents = new VoteEvents(new LogCollector(voteLogs()), repeated, governance, evmScript);

    assert.throws(() => voteEvents.item("Same"), /2 items titled "Same" — use itemAt\(0 \| 1\)/);
    voteEvents.itemAt(0, expectedEvents.stakingRouter.moduleSharesUpdated(stakingRouter, UPDATE_SHARES));
  });

  it("fails when the receipt has a different number of items than the vote", () => {
    assert.throws(
      () => new VoteEvents(new LogCollector(voteLogs()), [calls[0]], governance, evmScript),
      /Vote has 1 items but the receipt has 2 "LogScriptCall" logs/,
    );
  });

  it("adds the Dual Governance envelope to a submitProposal item", () => {
    const proposalCalls = [{ target: STAKING_ROUTER, value: 0n, payload: "0xabcdef01" as HexStrPrefixed }];
    const metadata = "Rotate the module shares";
    const submitCall = voteCall(
      "Submit proposal",
      dualGovernance.address,
      encodeFunctionData({ abi: IGovernance_ABI, functionName: "submitProposal", args: [proposalCalls, metadata] }),
    );
    const dgEvmScript = EvmScriptParser.encode([{ address: submitCall.target, calldata: submitCall.payload }]);
    const collector = new LogCollector([
      logScriptCall(dualGovernance.address),
      log(timelock, "ProposalSubmitted", [1n, adminExecutor.address, proposalCalls]),
      log(dualGovernance, "ProposalSubmitted", [voting.address, 1n, metadata]),
      log(voting, "ScriptResult", [callsScript.address, dgEvmScript, "0x", "0x"]),
      log(voting, "ExecuteVote", [1n]),
    ]);
    const voteEvents = new VoteEvents(collector, [submitCall], governance, dgEvmScript);

    voteEvents.item("Submit proposal");
    voteEvents.assertTail();

    collector.assertNothingLeft();
  });
});

describe("ProposalEvents", () => {
  beforeEach(() => {
    logIndex = 0;
  });

  const proposalCalls = [
    { target: STAKING_ROUTER, value: 0n, payload: "0xabcdef01" as HexStrPrefixed },
    { target: LDO, value: 0n, payload: "0x01020304" as HexStrPrefixed },
  ];

  function proposalLogs(): Log[] {
    return [
      updateSharesLog(),
      log(adminExecutor, "Executed", [STAKING_ROUTER, 0n, proposalCalls[0].payload, "0x"]),
      log(ldo, "Transfer", [SENDER, RECIPIENT, 10n]),
      log(adminExecutor, "Executed", [LDO, 0n, proposalCalls[1].payload, "0x"]),
      log(timelock, "ProposalExecuted", [1n]),
    ];
  }

  it("asserts calls by index with their Executed envelope", () => {
    const collector = new LogCollector(proposalLogs());
    const proposalEvents = new ProposalEvents(collector, proposalCalls, governance);

    proposalEvents.call(1, [event(ldo, "Transfer", [SENDER, RECIPIENT, 10n])]);
    proposalEvents.call(0, expectedEvents.stakingRouter.moduleSharesUpdated(stakingRouter, UPDATE_SHARES));
    proposalEvents.assertTail();

    collector.assertNothingLeft();
  });

  it("fails when the receipt has a different number of Executed logs than the proposal", () => {
    assert.throws(
      () => new ProposalEvents(new LogCollector(proposalLogs()), [proposalCalls[0]], governance),
      /Proposal has 1 calls but the receipt has 2 "Executed" logs/,
    );
  });

  it("checks the Executed payload against the proposal call", () => {
    const wrongPayload = [{ ...proposalCalls[0], payload: bytes.normalize("0xdeadbeef") }, proposalCalls[1]];
    const proposalEvents = new ProposalEvents(new LogCollector(proposalLogs()), wrongPayload, governance);

    assert.throws(() =>
      proposalEvents.call(0, expectedEvents.stakingRouter.moduleSharesUpdated(stakingRouter, UPDATE_SHARES)),
    );
  });
});
