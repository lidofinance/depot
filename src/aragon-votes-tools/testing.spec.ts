import { expect } from "chai";
import sinon from "sinon";
import { Voting_ABI } from "../../abi/Voting.abi";
import { DevRpcClient } from "../network";
import * as governance from "../omnibuses/governance-contracts";
import * as lifecycle from "./lifecycle";
import { HexStrPrefixed } from "../common/bytes";
import { CREATOR, CREATOR_ETH_BALANCE, CREATOR_LDO_BALANCE, LDO_WHALES_BY_NETWORK_NAME } from "./constants";
import { adoptAragonVoting, passAragonVote, setupLdoHolder } from "./testing";

describe("testing tools", () => {
  const whale = LDO_WHALES_BY_NETWORK_NAME.mainnet;
  const voteId = 7n;
  const ldo = { address: "0x00000000000000000000000000000000000000e1", abi: [] } as any;
  const voting = { address: "0x00000000000000000000000000000000000000e2", abi: Voting_ABI } as any;

  function createClient(): DevRpcClient {
    return {
      getNetworkName: sinon.stub().returns("mainnet"),
      read: sinon.stub(),
      write: sinon.stub(),
      getBalance: sinon.stub(),
      impersonate: sinon.stub().resolves(),
      stopImpersonating: sinon.stub().resolves(),
      increaseTime: sinon.stub().resolves(),
    } as unknown as DevRpcClient;
  }

  beforeEach(() => {
    sinon.stub(governance, "getGovernanceContracts").returns({ ldo, voting } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("setupLdoHolder returns account immediately when balance check passes", async () => {
    const client = createClient();
    (client.read as sinon.SinonStub).resolves(CREATOR_ETH_BALANCE);

    const result = await setupLdoHolder(client);

    expect(result).to.equal(CREATOR);
    expect((client.impersonate as sinon.SinonStub).called).to.be.false;
    expect((client.write as sinon.SinonStub).called).to.be.false;
  });

  it("setupLdoHolder funds creator from whale when creator has zero LDO", async () => {
    const client = createClient();
    const account = "0x00000000000000000000000000000000000000a1";
    (client.read as sinon.SinonStub).onFirstCall().resolves(1n).onSecondCall().resolves(0n);
    (client.getBalance as sinon.SinonStub).withArgs(whale).resolves(99n);

    await setupLdoHolder(client, account);

    expect((client.impersonate as sinon.SinonStub).firstCall.args).to.deep.equal([whale, 10n ** 18n]);
    expect(
      (client.write as sinon.SinonStub).calledOnceWithExactly(ldo, "transfer", [account, CREATOR_LDO_BALANCE], {
        from: whale,
      }),
    ).to.be.true;
    expect((client.stopImpersonating as sinon.SinonStub).firstCall.args).to.deep.equal([whale, 99n]);
    expect((client.impersonate as sinon.SinonStub).secondCall.args).to.deep.equal([account, CREATOR_ETH_BALANCE]);
  });

  it("passAragonVote returns existing execute receipt when vote already executed", async () => {
    const client = createClient();
    const executeReceipt = { transactionHash: "0xabc" };
    sinon.stub(lifecycle, "getExecuteReceipt").resolves(executeReceipt as any);
    (client.read as sinon.SinonStub).withArgs(voting, "getVote", [voteId]).resolves([true, true]);

    const result = await passAragonVote(client, voteId);

    expect(result).to.equal(executeReceipt);
    expect((lifecycle.getExecuteReceipt as sinon.SinonStub).calledOnceWithExactly(client, voteId)).to.be.true;
    expect((client.impersonate as sinon.SinonStub).called).to.be.false;
  });

  it("passAragonVote votes and executes when vote can be voted", async () => {
    const client = createClient();
    const executeReceipt = { transactionHash: "0xdef" };

    (client.read as sinon.SinonStub).callsFake((_contract, fn: string) => {
      if (fn === "getVote") return Promise.resolve([true, false]);
      if (fn === "canVote") return Promise.resolve(true);
      if (fn === "voteTime") return Promise.resolve(120n);
      throw new Error(`unexpected read ${fn}`);
    });
    (client.getBalance as sinon.SinonStub).withArgs(whale).resolves(1000n);
    (client.write as sinon.SinonStub).callsFake((_contract, fn: string) => {
      if (fn === "vote") return Promise.resolve({});
      if (fn === "executeVote") return Promise.resolve(executeReceipt);
      throw new Error(`unexpected write ${fn}`);
    });

    const result = await passAragonVote(client, voteId);

    expect(result).to.equal(executeReceipt);
    expect((client.impersonate as sinon.SinonStub).calledOnceWithExactly(whale, 10n * 10n ** 18n)).to.be.true;
    expect((client.write as sinon.SinonStub).calledWith(voting, "vote", [voteId, true, false], { from: whale })).to.be
      .true;
    expect((client.increaseTime as sinon.SinonStub).calledOnceWithExactly(120n)).to.be.true;
    expect((client.write as sinon.SinonStub).calledWith(voting, "executeVote", [voteId], { from: whale })).to.be.true;
    expect((client.stopImpersonating as sinon.SinonStub).calledOnceWithExactly(whale, 1000n)).to.be.true;
  });

  it("passAragonVote throws when whale cannot vote", async () => {
    const client = createClient();
    (client.read as sinon.SinonStub).callsFake((_contract, fn: string) => {
      if (fn === "getVote") return Promise.resolve([true, false]);
      if (fn === "canVote") return Promise.resolve(false);
      throw new Error(`unexpected read ${fn}`);
    });
    (client.getBalance as sinon.SinonStub).withArgs(whale).resolves(111n);

    await expect(passAragonVote(client, voteId)).to.be.rejectedWith("Can not vote");
    expect((client.write as sinon.SinonStub).called).to.be.false;
  });

  it("adoptAragonVoting returns both create and execute receipts", async () => {
    const client = createClient();
    const createReceipt = { transactionHash: "0x01" };
    const executeReceipt = { transactionHash: "0x02" };
    const evmScript = "0x1234" as HexStrPrefixed;

    sinon.stub(lifecycle, "startAragonVote").resolves({ voteId, receipt: createReceipt } as any);
    sinon.stub(lifecycle, "getExecuteReceipt").resolves(executeReceipt as any);
    (client.read as sinon.SinonStub).callsFake((_contract, fn: string) => {
      if (fn === "balanceOf") return Promise.resolve(CREATOR_ETH_BALANCE);
      if (fn === "getVote") return Promise.resolve([true, true]);
      throw new Error(`unexpected read ${fn}`);
    });

    const result = await adoptAragonVoting(client, evmScript, "my vote");

    expect(result).to.deep.equal({
      voteId,
      createVoteReceipt: createReceipt,
      executeVoteReceipt: executeReceipt,
    });
    expect(
      (lifecycle.startAragonVote as sinon.SinonStub).calledOnceWithExactly(client, evmScript, "my vote", {
        from: CREATOR,
      }),
    ).to.be.true;
  });
});
