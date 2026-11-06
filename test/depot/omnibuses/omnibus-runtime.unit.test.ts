import { assert } from "chai";
import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { encodeFunctionData, TransactionReceipt } from "viem";

import { Address } from "abitype";

import { IGovernance_ABI } from "@/abi/IGovernance.abi";
import { EvmScriptParser } from "@/src/aragon-votes-tools";
import { HexStrPrefixed } from "@/src/common/bytes";
import { Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { Omnibus, OmnibusConfig, TestProposalFnCtx, VoteCall } from "@/src/omnibuses";
import { ProposalStatus } from "@/src/omnibuses/dual-governance";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { eventLog } from "../helpers/event-log";

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
  return {
    ...eventLog(emitter, name, args),
    blockTimestamp: undefined,
    logIndex: 0,
    blockHash: "0x00",
    blockNumber: 1n,
    transactionHash: "0x00",
    transactionIndex: 0,
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

  // executed on chain: the vote, and the proposals when their status is Executed
  interface ChainState {
    voteExecuted: boolean;
    proposalStatus: ProposalStatus;
  }

  async function fixture(
    overrides: Partial<OmnibusConfig<"mainnet", Record<string, Contract>>> = {},
    chain: ChainState = { voteExecuted: false, proposalStatus: ProposalStatus.Scheduled },
  ) {
    const afterExecution = sinon.stub<[DevRpcClient], Promise<void>>().resolves();
    const evmScript = EvmScriptParser.encode(calls.map((call) => ({ address: call.target, calldata: call.payload })));
    const voteReceipt = receipt([
      ...calls.flatMap((call, index) => [
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
    client.getBalance.resolves(0n);
    client.getLogsInWindows.resolves([{ transactionHash: voteReceipt.transactionHash }] as never);
    client.getTransactionReceipt.resolves(voteReceipt);
    client.read.callsFake((_contract, name, args) => {
      const responses: Record<string, unknown> = {
        getOmnibusCalls: calls,
        getEVMScript: evmScript,
        votesLength: 2n,
        getVotePhase: 0,
        getVote: [!chain.voteExecuted, chain.voteExecuted, 0n, 0n, 0n, 1n, 2n, 0n, 2n, evmScript],
        canVote: false,
        voteTime: 0n,
        PCT_BASE: 100n,
        getAfterSubmitDelay: 0,
        getAfterScheduleDelay: 0,
        getConfigProvider: sender,
        getGovernance: dualGovernance.address,
        getStateDetails: { effectiveState: 1 },
        getDualGovernanceConfig: {},
        getEffectiveState: 1,
        canExecute: true,
        canScheduleProposal: true,
      };
      if (name === "getProposalDetails") {
        return Promise.resolve({ id: args[0], status: chain.proposalStatus } as never);
      }
      if (name === "getProposalCalls") {
        return Promise.resolve(proposalCalls[proposalIds.indexOf(args[0] as bigint)] as never);
      }
      if (!(name in responses)) {
        throw new Error(`Unexpected read ${name}`);
      }
      return Promise.resolve(responses[name] as never);
    });
    client.write.callsFake((_contract, name, args) => {
      if (name === "executeVote" || name === "scheduleProposal") {
        return Promise.resolve(voteReceipt);
      }
      assert.equal(name, "execute");
      return Promise.resolve(proposalReceipts[proposalIds.indexOf(args[0] as bigint)]);
    });
    const omnibus = Omnibus.create({
      network: "mainnet",
      upgrade: false,
      voteId: 1,
      deployment: { omnibus: Omnibus.deployedContract(sender) },
      testVote: async ({ passOmnibus }) => {
        const { voteEvents } = await passOmnibus();
        calls.forEach((call) => voteEvents.item(call.title));
      },
      testProposal: async ({ passProposals }) => {
        const { proposalEvents } = await passProposals();
        proposalEvents.forEach((proposal) => proposal.call(0));
      },
      ...overrides,
    });
    await omnibus.loadAndValidateOmnibusContractCalls(client);
    return { omnibus, client, afterExecution };
  }

  function executedProposals(client: sinon.SinonStubbedInstance<DevRpcClient>) {
    return client.write
      .getCalls()
      .filter((call) => call.args[1] === "execute")
      .map((call) => call.args[2]);
  }

  it("runs the hook after complete vote and proposal validation and before reverting", async () => {
    const { omnibus, client, afterExecution } = await fixture();
    assert.equal(await omnibus.test(client, afterExecution), "voting");
    assert.deepEqual(executedProposals(client), [[11n], [12n]]);
    sinon.assert.calledOnceWithExactly(afterExecution, client);
    assert.isTrue(client.write.lastCall.calledBefore(afterExecution.firstCall));
    sinon.assert.callOrder(afterExecution, client.revert);
    sinon.assert.calledOnceWithExactly(client.revert, "0x01");
  });

  it("runs reference setup before governance and isolates comparison before acceptance", async () => {
    const { omnibus, client, afterExecution } = await fixture();
    client.snapshot.onSecondCall().resolves("0x02");
    client.withSnapshot.callThrough();
    const beforeExecution = sinon.stub<[], Promise<void>>().resolves();
    const compareUpgraded = sinon.stub<[], Promise<void>>().resolves();

    await omnibus.test(client, afterExecution, { beforeExecution, afterExecution: compareUpgraded });

    sinon.assert.callOrder(beforeExecution, client.write, compareUpgraded, afterExecution);
    assert.deepEqual(
      client.revert.getCalls().map((call) => call.args),
      [["0x02"], ["0x01"]],
    );
    assert.isTrue(client.revert.firstCall.calledBefore(afterExecution.firstCall));
    assert.isTrue(client.revert.lastCall.calledAfter(afterExecution.firstCall));
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

  it("does not discard unexplained logs when a proposal is requested again", async () => {
    const { omnibus, client, afterExecution } = await fixture({
      testProposal: async ({ passProposals }) => {
        const first = await passProposals();
        const again = await passProposals();
        assert.strictEqual(first.logs[0], again.logs[0]);
        again.proposalEvents[1].call(0);
      },
    });
    await rejects(omnibus.test(client, afterExecution), /Unchecked log items left/);
    sinon.assert.notCalled(afterExecution);
  });

  it("requires the vote callback to execute the vote", async () => {
    const { omnibus, client, afterExecution } = await fixture({ testVote: async () => {} });
    await rejects(omnibus.test(client, afterExecution), /Vote is not executed/);
    sinon.assert.notCalled(afterExecution);
    sinon.assert.calledOnceWithExactly(client.revert, "0x01");
  });

  it("rejects unconsumed vote items", async () => {
    const { omnibus, client, afterExecution } = await fixture({
      testVote: async ({ passOmnibus }) => {
        await passOmnibus();
      },
    });
    await rejects(omnibus.test(client, afterExecution), /Unchecked log items left/);
    sinon.assert.notCalled(afterExecution);
  });

  describe("a launched vote", () => {
    it("rejects a voting-stage script that differs from the contract before any fork action", async () => {
      const testVote = sinon.stub().resolves();
      const { omnibus, client } = await fixture({ testVote });
      client.read
        .withArgs(sinon.match.any, "getVote")
        .resolves([true, false, 0n, 0n, 0n, 1n, 2n, 0n, 2n, "0x00000001"] as never);

      await rejects(omnibus.test(client), /On-chain script of vote 1 differs/);
      sinon.assert.notCalled(client.snapshot);
      sinon.assert.notCalled(testVote);
    });
  });

  describe("a vote executed on chain", () => {
    function callbacks() {
      return {
        testVote: sinon.stub().resolves(),
        testProposal: sinon
          .stub<[TestProposalFnCtx<Record<string, Contract>>], Promise<void>>()
          .callsFake(async ({ passProposals }) => {
            const { proposalEvents } = await passProposals();
            proposalEvents.forEach((proposal) => proposal.call(0));
          }),
        testFinalState: sinon.stub().resolves(),
      };
    }

    it("executes pending DG proposals on the fork, skipping the vote callback", async () => {
      const authored = callbacks();
      const { omnibus, client, afterExecution } = await fixture(authored, {
        voteExecuted: true,
        proposalStatus: ProposalStatus.Submitted,
      });

      assert.equal(await omnibus.test(client, afterExecution), "dg-pending");

      sinon.assert.notCalled(authored.testVote);
      sinon.assert.calledOnce(authored.testProposal);
      sinon.assert.callOrder(authored.testProposal, authored.testFinalState, afterExecution);
      assert.deepEqual(executedProposals(client), [[11n], [12n]]);
      assert.isFalse(client.write.calledWith(sinon.match.any, "executeVote"));
    });

    it("rejects on-chain proposal calls that differ from the contract", async () => {
      const { omnibus, client } = await fixture(callbacks(), {
        voteExecuted: true,
        proposalStatus: ProposalStatus.Submitted,
      });
      client.read.withArgs(sinon.match.any, "getProposalCalls", [12n]).resolves(proposalCalls[0] as never);

      await rejects(omnibus.test(client), /On-chain calls of DG proposal 12 differ/);
      sinon.assert.notCalled(client.write);
    });

    it("refuses upgrade snapshot hooks", async () => {
      const { omnibus, client } = await fixture(callbacks(), {
        voteExecuted: true,
        proposalStatus: ProposalStatus.Submitted,
      });
      const hooks = { beforeExecution: sinon.stub().resolves(), afterExecution: sinon.stub().resolves() };

      await rejects(omnibus.test(client, undefined, hooks), /Upgrade snapshots need a vote/);
      sinon.assert.notCalled(hooks.beforeExecution);
    });
  });
});
