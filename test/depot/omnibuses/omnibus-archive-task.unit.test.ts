import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sinon from "sinon";
import { TransactionReceipt } from "viem";

import { RpcClient } from "@/src/network";
import { ProposalStatus } from "@/src/omnibuses/dual-governance";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { omnibusTaskBuilders, omnibusTaskDeps } from "@/tasks/omnibuses";
import { eventLog } from "../helpers/event-log";

chai.use(chaiAsPromised);
const assert: Chai.AssertStatic = chai.assert;

const { dualGovernance, timelock, voting } = getGovernanceContracts("mainnet");

describe("omnibus:archive", () => {
  let hre: HardhatRuntimeEnvironment;
  let root: string;
  let ongoing: string;

  before(async () => {
    hre = await createHardhatRuntimeEnvironment({ tasks: omnibusTaskBuilders.map((builder) => builder.build()) });
  });

  beforeEach(async () => {
    root = await mkdtemp(path.resolve("omnibuses/_archive_task_"));
    ongoing = path.join(root, "ongoing", "mainnet", "fixture");
    await mkdir(ongoing, { recursive: true });
    const module = path.relative(ongoing, path.resolve("src/omnibuses/omnibus"));
    await writeFile(
      path.join(ongoing, "fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", upgrade: false, voteId: 7, deployment: { omnibus: Omnibus.deployedContract("0x0000000000000000000000000000000000000001") }, testVote: async () => {} });`,
    );
    sinon.stub(console, "log");
    sinon.stub(omnibusTaskDeps, "getOmnibusesDir").returns(root);
  });

  afterEach(async () => {
    sinon.restore();
    await rm(root, { recursive: true, force: true });
  });

  function chain(vote: { open: boolean; executed: boolean; canExecute: boolean }, proposalStatus?: ProposalStatus) {
    const client = sinon.createStubInstance(RpcClient);
    client.getNetworkName.returns("mainnet");
    client.read.withArgs(sinon.match.any, "votesLength").resolves(8n as never);
    client.read.withArgs(sinon.match.any, "getVote").resolves([vote.open, vote.executed, 0n, 100n] as never);
    client.read.withArgs(sinon.match.any, "isValidVoteScript").resolves(true as never);
    client.read.withArgs(sinon.match.any, "getOmnibusCalls").resolves([] as never);
    client.read.withArgs(sinon.match.any, "getEVMScript").resolves("0x00000001" as never);
    client.read.withArgs(sinon.match.any, "canExecute").resolves(vote.canExecute as never);
    client.read.withArgs(sinon.match.any, "getProposalDetails").resolves({ status: proposalStatus } as never);
    const receipt = {
      logs: [
        eventLog(timelock, "ProposalSubmitted", [15n, voting.address, []]),
        eventLog(dualGovernance, "ProposalSubmitted", [voting.address, 15n, "Metadata"]),
        eventLog(voting, "ExecuteVote", [7n]),
      ],
    } as TransactionReceipt;
    client.getLogsInWindows.resolves([{ transactionHash: "0x01" }] as never);
    client.getTransactionReceipt.resolves(receipt);
    sinon.stub(omnibusTaskDeps, "createRpcClient").resolves(client);
    return client;
  }

  const archive = () => hre.tasks.getTask("omnibus:archive").run({ name: "fixture" });

  it("refuses while the DG proposal is not executed", async () => {
    chain({ open: false, executed: true, canExecute: false }, ProposalStatus.Scheduled);
    await assert.isRejected(archive(), "its DG proposals are not: 15 (Scheduled)");
    await access(ongoing);
  });

  it("refuses a vote whose script does not match the omnibus contract", async () => {
    const client = chain({ open: false, executed: true, canExecute: false }, ProposalStatus.Executed);
    client.read.withArgs(sinon.match.any, "isValidVoteScript").resolves(false as never);
    await assert.isRejected(archive(), "Vote 7 script does not match the omnibus contract");
    await access(ongoing);
  });

  it("refuses an open vote", async () => {
    chain({ open: true, executed: false, canExecute: false });
    await assert.isRejected(archive(), "Vote 7 is not finished");
    await access(ongoing);
  });
});
