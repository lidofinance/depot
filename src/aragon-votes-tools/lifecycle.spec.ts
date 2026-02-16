import { expect } from "chai";
import sinon from "sinon";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics } from "viem";
import { executeAragonVote, getExecuteReceipt, startAragonVote } from "./lifecycle";
import { RpcClient, WriteContractOptions } from "../network";
import { HexStrPrefixed } from "../common/bytes";
import { Voting_ABI } from "../../abi/Voting.abi";
import { EvmScriptParser } from "./evm-script-parser";
import * as contracts from "../contracts/contracts";

describe("lifecycle functions", () => {
  const voteId = 42n;
  const creator = "0x00000000000000000000000000000000000000a1";
  const description = "Test Description";
  const evmScript = "0x1234" as HexStrPrefixed;
  const startVoteScript = "0xabcd" as HexStrPrefixed;
  const txOptions = { from: "0x00000000000000000000000000000000000000b2" } as WriteContractOptions;

  const voting = {
    address: "0x00000000000000000000000000000000000000c3",
    abi: Voting_ABI,
  } as any;
  const tokenManager = {
    address: "0x00000000000000000000000000000000000000d4",
    abi: [],
  } as any;

  function createStartVoteLog() {
    const topics = encodeEventTopics({
      abi: Voting_ABI,
      eventName: "StartVote",
      args: { voteId, creator },
    });
    const data = encodeAbiParameters([{ name: "metadata", type: "string" }], [description]);
    return { topics, data };
  }

  function createClient(): RpcClient {
    return {
      getNetworkName: sinon.stub().returns("mainnet"),
      write: sinon.stub(),
      viemClient: {
        createEventFilter: sinon.stub(),
        getFilterLogs: sinon.stub(),
        getTransactionReceipt: sinon.stub(),
      },
    } as unknown as RpcClient;
  }

  beforeEach(() => {
    sinon.stub(contracts, "getLidoContracts").returns({ voting, tokenManager } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("starts a vote and returns voteId + receipt", async () => {
    const client = createClient();
    const receipt = { logs: [createStartVoteLog()] };
    const encodeStub = sinon.stub(EvmScriptParser, "encode").returns(startVoteScript);
    (client.write as sinon.SinonStub).resolves(receipt);

    const result = await startAragonVote(client, evmScript, description, txOptions);

    expect(result.voteId).to.equal(voteId);
    expect(result.receipt).to.equal(receipt);
    expect(
      (client.write as sinon.SinonStub).calledOnceWithExactly(tokenManager, "forward", [startVoteScript], txOptions),
    ).to.be.true;

    const [calls] = encodeStub.firstCall.args;
    expect(calls).to.have.length(1);
    expect(calls[0].address).to.equal(voting.address);
    const decoded = decodeFunctionData({ abi: Voting_ABI, data: calls[0].calldata });
    expect(decoded.functionName).to.equal("newVote");
    expect(decoded.args).to.deep.equal([evmScript, description, false, false]);
  });

  it("throws when StartVote log is absent", async () => {
    const client = createClient();
    sinon.stub(EvmScriptParser, "encode").returns(startVoteScript);
    (client.write as sinon.SinonStub).resolves({ logs: [] });

    await expect(startAragonVote(client, evmScript, description, txOptions)).to.be.rejectedWith(
      "StartVote log not found",
    );
  });

  it("propagates write errors from startAragonVote", async () => {
    const client = createClient();
    sinon.stub(EvmScriptParser, "encode").returns(startVoteScript);
    (client.write as sinon.SinonStub).rejects(new Error("Forward error"));

    await expect(startAragonVote(client, evmScript, description, txOptions)).to.be.rejectedWith("Forward error");
  });

  it("executes vote through RpcClient.write", async () => {
    const client = createClient();
    const receipt = { transactionHash: "0x01" };
    (client.write as sinon.SinonStub).resolves(receipt);

    const result = await executeAragonVote(client, voteId, txOptions);

    expect(result).to.equal(receipt);
    expect((client.write as sinon.SinonStub).calledOnceWithExactly(voting, "executeVote", [voteId], txOptions)).to.be
      .true;
  });

  it("returns ExecuteVote tx receipt by vote id", async () => {
    const client = createClient();
    const filter = {} as any;
    const executeReceipt = { transactionHash: "0xabc" };
    (client.viemClient.createEventFilter as sinon.SinonStub).resolves(filter);
    (client.viemClient.getFilterLogs as sinon.SinonStub).resolves([{ transactionHash: "0xabc" }]);
    (client.viemClient.getTransactionReceipt as sinon.SinonStub).resolves(executeReceipt);

    const result = await getExecuteReceipt(client, voteId, 123);

    expect(result).to.equal(executeReceipt);
    expect((client.viemClient.createEventFilter as sinon.SinonStub).calledOnce).to.be.true;
    const createFilterArgs = (client.viemClient.createEventFilter as sinon.SinonStub).firstCall.args[0];
    expect(createFilterArgs.address).to.equal(voting.address);
    expect(createFilterArgs.args).to.deep.equal([voteId]);
    expect(createFilterArgs.fromBlock).to.equal(123n);
    expect((client.viemClient.getFilterLogs as sinon.SinonStub).calledOnceWithExactly({ filter })).to.be.true;
    expect((client.viemClient.getTransactionReceipt as sinon.SinonStub).calledOnceWithExactly({ hash: "0xabc" })).to.be
      .true;
  });

  it("throws when ExecuteVote event cannot be found", async () => {
    const client = createClient();
    const filter = {} as any;
    (client.viemClient.createEventFilter as sinon.SinonStub).resolves(filter);
    (client.viemClient.getFilterLogs as sinon.SinonStub).resolves([]);

    await expect(getExecuteReceipt(client, voteId)).to.be.rejectedWith("ExecuteVote event with id 42 is not found");
  });
});
