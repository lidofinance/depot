import { expect } from "chai";
import sinon from "sinon";
import { execute, start, wait } from "./lifecycle";
import { ContractTransactionResponse, Signer } from "ethers";
import lido from "../lido";
import providers from "../providers";
import * as voteScript from "./vote-script";
import Sinon from "sinon";
import { HexStrPrefixed } from "../common/bytes";
import { ContractEvmCall } from "./vote-script";
import { randomAddress } from "hardhat/internal/hardhat-network/provider/utils/random";

describe("start function", () => {
  let mockSigner: Signer;
  let mockVoting: any;
  let mockTokenManager: any;
  let mockChainId: sinon.SinonStub;
  let mockCall: sinon.SinonStub;
  let mockEvm: sinon.SinonStub;

  const mockTopicHash = "mockTopicHash";
  const evmReturn = randomAddress().toString();
  const callReturn = new ContractEvmCall({} as any, {} as any, [] as any);

  beforeEach(() => {
    mockSigner = {} as Signer;
    mockVoting = {
      "newVote(bytes,string,bool,bool)": sinon.stub().resolves({}),
      interface: {
        getEvent: Sinon.stub().returns({
          topicHash: mockTopicHash,
        }),
        parseLog: Sinon.stub().returns({ args: [BigInt(1)] }),
        executeVote: sinon.stub(),
      },
    };
    mockTokenManager = {
      connect: sinon.stub().returnsThis(),
      forward: sinon.stub().resolves({}),
    };
    mockChainId = sinon.stub(providers, "chainId").resolves(1n);
    sinon.stub(lido, "chainId").returns({ voting: mockVoting, tokenManager: mockTokenManager } as unknown as any);
    mockCall = sinon.stub(voteScript, "call").returns(callReturn);
    mockEvm = sinon.stub(voteScript, "evm").returns(evmReturn as HexStrPrefixed);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should start a vote with provided parameters", async () => {
    const result = await start(mockSigner, "mockEvmScript", "Test Description", true);

    expect(mockCall.firstCall.args).to.be.deep.equal([
      mockVoting["newVote(bytes,string,bool,bool)"],
      ["mockEvmScript", "Test Description", true, false],
    ]);
    expect(mockEvm.calledWith(callReturn)).to.be.true;
    expect(mockTokenManager.connect.calledWith(mockSigner)).to.be.true;
    expect(mockTokenManager.forward.calledWith(evmReturn)).to.be.true;
    expect(result).to.be.an("object");
  });

  it("should start a vote with default castVote parameter", async () => {
    await start(mockSigner, "mockEvmScript", "Test Description");

    expect(mockCall.firstCall.args).to.be.deep.equal([
      mockVoting["newVote(bytes,string,bool,bool)"],
      ["mockEvmScript", "Test Description", false, false],
    ]);
  });

  it("should throw an error if chainId retrieval fails", async () => {
    mockChainId.rejects(new Error("ChainId error"));

    await expect(start(mockSigner, "mockEvmScript", "Test Description")).to.be.rejectedWith("ChainId error");
  });

  it("should throw an error if forward transaction fails", async () => {
    mockTokenManager.forward.rejects(new Error("Forward error"));

    await expect(start(mockSigner, "mockEvmScript", "Test Description")).to.be.rejectedWith("Forward error");
  });

  it("should return voteId and receipt when StartVote log is found", async () => {
    const mockTx = {
      wait: sinon.stub().resolves({ logs: [{ topics: [mockTopicHash], data: "mockData" }] }),
    } as unknown as ContractTransactionResponse;
    const mockReceipt = {
      logs: [{ topics: [mockTopicHash], data: "mockData" }],
    };

    const result = await wait(mockTx);

    expect(result.voteId).to.equal(BigInt(1));
    expect(result.receipt).to.deep.equal(mockReceipt);
  });

  it("should throw an error if receipt is not found", async () => {
    const mockTx = { wait: sinon.stub().resolves(null) } as unknown as ContractTransactionResponse;

    await expect(wait(mockTx)).to.be.rejectedWith("Invalid confirmations value");
  });

  it("should throw an error if StartVote log is not found", async () => {
    const mockTx = { wait: sinon.stub().resolves({ logs: [] }) } as unknown as ContractTransactionResponse;

    await expect(wait(mockTx)).to.be.rejectedWith("StartVote log not found");
  });

  it("should execute vote with provided voteId and return receipt", async () => {
    const mockTx = { wait: sinon.stub().resolves({}) } as unknown as ContractTransactionResponse;
    mockVoting.executeVote = sinon.stub().resolves(mockTx);

    const result = await execute(mockSigner, 1);

    expect(mockVoting.executeVote.calledWith(1)).to.be.true;
    expect(result).to.deep.equal({});
  });

  it("should throw an error if transaction wait fails", async () => {
    const mockTx = { wait: sinon.stub().resolves(null) } as unknown as ContractTransactionResponse;
    mockVoting.executeVote = sinon.stub().resolves(mockTx);

    await expect(execute(mockSigner, 1)).to.be.rejectedWith("transaction wait failed");
  });

  it("should execute vote with bigint voteId and return receipt", async () => {
    const mockTx = { wait: sinon.stub().resolves({}) } as unknown as ContractTransactionResponse;
    mockVoting.executeVote = sinon.stub().resolves(mockTx);

    const result = await execute(mockSigner, 1n);

    expect(mockVoting.executeVote.calledWith(BigInt(1))).to.be.true;
    expect(result).to.deep.equal({});
  });

  it("should execute vote with string voteId and return receipt", async () => {
    const mockTx = { wait: sinon.stub().resolves({}) } as unknown as ContractTransactionResponse;
    mockVoting.executeVote = sinon.stub().resolves(mockTx);

    const result = await execute(mockSigner, "1");

    expect(mockVoting.executeVote.calledWith("1")).to.be.true;
    expect(result).to.deep.equal({});
  });
});
