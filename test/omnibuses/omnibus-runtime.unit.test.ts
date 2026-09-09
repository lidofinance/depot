import { assert } from "chai";
import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, Hex, TransactionReceipt } from "viem";

import { Address } from "abitype";

import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import { EvmScriptParser } from "../../src/aragon-votes-tools";
import { testingDeps } from "../../src/aragon-votes-tools/testing";
import { HexStrPrefixed } from "../../src/common/bytes";
import { Contract } from "../../src/contracts";
import { DevRpcClient } from "../../src/network";
import { Omnibus, OmnibusConfig, VoteCall } from "../../src/omnibuses";
import { ProposalStatus } from "../../src/omnibuses/dual-governance";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";

const governance = getGovernanceContracts("mainnet");
const { voting, callsScript, dualGovernance, timelock, adminExecutor } = governance;
const sender: Address = "0x0000000000000000000000000000000000000001";
const proposalIds = [11n, 12n];
const proposalCalls = proposalIds.map((id) => [{ target: sender, value: id, payload: "0x" as HexStrPrefixed }]);
const calls: VoteCall[] = proposalCalls.map((items, index) => ({
  title: `Submit proposal ${index + 1}`,
  target: dualGovernance.address,
  payload: encodeFunctionData({
    abi: IGovernance_ABI,
    functionName: "submitProposal",
    args: [items, `Metadata ${index + 1}`],
  }),
}));

function log(emitter: Contract, name: string, args: unknown[]): TransactionReceipt["logs"][number] {
  const abi = emitter.abi.find((item) => item.type === "event" && item.name === name);
  if (!abi || abi.type !== "event") {
    throw new Error(`Unknown event ${name}`);
  }
  return {
    address: emitter.address,
    topics: encodeEventTopics({
      abi: [abi],
      eventName: name,
      args: abi.inputs.flatMap((input, index) => (input.indexed ? [args[index]] : [])) as never,
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters(
      abi.inputs.filter((input) => !input.indexed),
      abi.inputs.flatMap((input, index) => (input.indexed ? [] : [args[index]])),
    ),
    logIndex: 0,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
    removed: false,
  };
}

function receipt(logs: TransactionReceipt["logs"]): TransactionReceipt {
  return {
    logs,
    blockHash: "0x00",
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 0n,
    effectiveGasPrice: 0n,
    from: sender,
    gasUsed: 0n,
    logsBloom: "0x",
    status: "success",
    to: voting.address,
    transactionHash: "0x00",
    transactionIndex: 0,
    type: "legacy",
  };
}

describe("Omnibus runtime completion", () => {
  afterEach(() => sinon.restore());

  async function fixture(overrides: Partial<OmnibusConfig<"mainnet", Record<string, Contract>>> = {}, count = 2) {
    const voteCalls = calls.slice(0, count);
    const evmScript = EvmScriptParser.encode(
      voteCalls.map((call) => ({ address: call.target, calldata: call.payload })),
    );
    const voteReceipt = receipt([
      ...voteCalls.flatMap((call, index) => [
        log({ ...callsScript, address: voting.address }, "LogScriptCall", [sender, voting.address, call.target]),
        log(timelock, "ProposalSubmitted", [proposalIds[index], adminExecutor.address, proposalCalls[index]]),
        log(dualGovernance, "ProposalSubmitted", [voting.address, proposalIds[index], `Metadata ${index + 1}`]),
      ]),
      log(voting, "ScriptResult", [callsScript.address, evmScript, "0x", "0x"]),
      log(voting, "ExecuteVote", [1n]),
    ]);
    const proposalReceipts = proposalCalls.map(([call], index) =>
      receipt([
        log(adminExecutor, "Executed", [call.target, call.value, call.payload, "0x"]),
        log(timelock, "ProposalExecuted", [proposalIds[index]]),
      ]),
    );
    const client = sinon.createStubInstance(DevRpcClient);
    client.getNetworkName.returns("mainnet");
    client.snapshot.resolves("0x01");
    client.getAccounts.resolves([sender]);
    client.getChainTime.resolves(1);
    client.read.callsFake((_contract, name, args) => {
      const responses: Record<string, unknown> = {
        getOmnibusCalls: voteCalls,
        getEVMScript: evmScript,
        getVote: [false, true],
        getAfterSubmitDelay: 0,
        getAfterScheduleDelay: 0,
        getConfigProvider: sender,
        getGovernance: dualGovernance.address,
        getStateDetails: { effectiveState: 1 },
        getDualGovernanceConfig: {},
        getEffectiveState: 1,
        canExecute: true,
      };
      if (name === "getProposalDetails") {
        return Promise.resolve({ id: args[0], status: ProposalStatus.Scheduled } as never);
      }
      if (!(name in responses)) {
        throw new Error(`Unexpected read ${name}`);
      }
      return Promise.resolve(responses[name] as never);
    });
    client.write.callsFake((_contract, name, args) => {
      assert.equal(name, "execute");
      return Promise.resolve(proposalReceipts[proposalIds.indexOf(args[0] as bigint)]);
    });
    sinon.stub(testingDeps, "getExecuteReceipt").resolves(voteReceipt);
    const omnibus = Omnibus.create({
      network: "mainnet",
      voteId: 1,
      deployment: { omnibus: Omnibus.deployedContract(sender) },
      testVote: async ({ passOmnibus }) => {
        const { voteEvents } = await passOmnibus();
        voteCalls.forEach((call) => voteEvents.item(call.title));
      },
      testProposal: async ({ passProposals }) => {
        const { proposalEvents } = await passProposals();
        proposalEvents.forEach((proposal) => proposal.call(0));
      },
      ...overrides,
    });
    await omnibus.loadAndValidateOmnibusContractCalls(client);
    return { omnibus, client, voteReceipt, proposalReceipts };
  }

  it("validates complete vote and proposal receipts and restores its snapshot", async () => {
    const { omnibus, client } = await fixture();
    await omnibus.test(client);
    assert.deepEqual(
      client.write.getCalls().map((call) => call.args[2]),
      [[11n], [12n]],
    );
    sinon.assert.calledOnceWithExactly(client.revert, "0x01");
  });

  it("rejects an empty execution list while proposals remain pending", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        await passProposals([]);
      },
    });
    await rejects(omnibus.test(client), /Proposals (?:is|are) not executed/);
    sinon.assert.calledOnceWithExactly(client.revert, "0x01");
  });

  it("rejects completion after executing only a subset", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        const { proposalEvents } = await passProposals([11n]);
        proposalEvents[0].call(0);
      },
    });
    await rejects(omnibus.test(client), /Proposals (?:is|are) not executed/);
  });

  it("matches reordered proposal receipts to their own calls", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        const { proposalEvents } = await passProposals([12n, 11n]);
        proposalEvents.forEach((proposal) => proposal.call(0));
      },
    });
    await omnibus.test(client);
  });

  it("allows staged execution in either order", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        for (const id of [12n, 11n]) {
          const { proposalEvents } = await passProposals([id]);
          proposalEvents[0].call(0);
        }
      },
    });
    await omnibus.test(client);
  });

  it("does not discard unexplained logs when a proposal is requested again", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        const first = await passProposals();
        const again = await passProposals();
        assert.strictEqual(first.logs[0], again.logs[0]);
        again.proposalEvents[1].call(0);
      },
    });
    await rejects(omnibus.test(client), /Unchecked log items left/);
  });

  it("retains consumed collectors when the complete proposal set is requested again", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        const { proposalEvents } = await passProposals();
        proposalEvents.forEach((proposal) => proposal.call(0));
        await passProposals();
      },
    });
    await omnibus.test(client);
  });

  it("rejects IDs from outside this vote before executing them", async () => {
    const { omnibus, client } = await fixture({
      testProposal: async ({ passProposals }) => {
        await passProposals([99n]);
      },
    });
    await rejects(omnibus.test(client), /Proposal 99 was not submitted by this vote/);
    sinon.assert.notCalled(client.write);
  });

  it("requires the vote callback to execute the vote", async () => {
    const { omnibus, client } = await fixture({ testVote: async () => {} });
    await rejects(omnibus.test(client), /Vote is not executed/);
    sinon.assert.calledOnceWithExactly(client.revert, "0x01");
  });

  it("requires a proposal callback and proposal execution", async () => {
    const missing = await fixture({ testProposal: undefined });
    await rejects(missing.omnibus.test(missing.client), /testProposal function is not defined/);
  });

  it("rejects a proposal callback that does not execute proposals", async () => {
    const { omnibus, client } = await fixture({ testProposal: async () => {} });
    await rejects(omnibus.test(client), /Proposals (?:is|are) not executed/);
  });

  it("rejects unconsumed vote items", async () => {
    const { omnibus, client } = await fixture({
      testVote: async ({ passOmnibus }) => {
        await passOmnibus();
      },
    });
    await rejects(omnibus.test(client), /Unchecked log items left/);
  });

  it("rejects a missing proposal tail", async () => {
    const { omnibus, client, proposalReceipts } = await fixture();
    proposalReceipts[0].logs.pop();
    await rejects(omnibus.test(client), /ProposalExecuted/);
  });

  it("accepts a vote without proposals", async () => {
    const { omnibus, client } = await fixture({ testProposal: undefined }, 0);
    await omnibus.test(client);
    sinon.assert.notCalled(client.write);
  });

  it("rejects executedAt before taking a snapshot even without a vote ID", async () => {
    const testVote = sinon.stub().resolves();
    const { omnibus, client } = await fixture({ executedAt: 1, voteId: undefined, testVote });

    await rejects(omnibus.test(client), /executed at block 1/);
    sinon.assert.notCalled(client.snapshot);
    sinon.assert.notCalled(client.revert);
    sinon.assert.notCalled(testVote);
  });

  it("requires testProposal even when all submitted proposals report Executed", async () => {
    const { omnibus, client, proposalReceipts } = await fixture({ testProposal: undefined });
    client.read.withArgs(sinon.match.any, "getProposalDetails", sinon.match.any).resolves({
      status: ProposalStatus.Executed,
    } as never);
    client.getBlockNumber.resolves(20n);
    client.getFilterLogs.resolves(proposalReceipts[0].logs);
    client.getTransactionReceipt.resolves(proposalReceipts[0]);

    await rejects(omnibus.test(client), /testProposal function is not defined/);
  });
});
