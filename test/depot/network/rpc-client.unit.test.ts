import { expect } from "chai";
import sinon from "sinon";
import {
  createWalletClient,
  custom,
  encodeEventTopics,
  keccak256,
  parseAbiItem,
  publicActions,
  TransactionSerialized,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { contract } from "@/src/contracts/contracts";
import { RpcClient } from "@/src/network/rpc-client";

type RpcHandler = (method: string, params: unknown[]) => unknown;

function buildRpcClient(handler: RpcHandler): RpcClient {
  const provider = {
    request: ({ method, params }: { method: string; params?: unknown[] }) =>
      Promise.resolve(handler(method, params ?? [])),
  };
  const transport = custom(provider);
  const viemClient = createWalletClient({ chain: mainnet, transport }).extend(publicActions);
  return new RpcClient("mainnet", viemClient as unknown as ConstructorParameters<typeof RpcClient>[1]);
}

describe("RpcClient locally signed transactions", () => {
  // well-known hardhat test account #0, never holds real funds
  const pilot = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const target = contract(
    [{ type: "function", name: "ping", inputs: [], outputs: [], stateMutability: "nonpayable" }] as const,
    "0x0000000000000000000000000000000000000001",
  );

  afterEach(() => sinon.restore());

  it("prints the hash before sending and warns against a rerun when the receipt times out", async () => {
    const rawTransactions: TransactionSerialized[] = [];
    const sendRawTransaction = sinon.stub();
    const client = buildRpcClient((method, params) => {
      switch (method) {
        case "eth_chainId":
          return "0x1";
        case "eth_call":
          return "0x";
        case "eth_getTransactionCount":
          return "0x5";
        case "eth_estimateGas":
          return "0x5208";
        case "eth_maxPriorityFeePerGas":
          return "0x1";
        case "eth_getBlockByNumber":
          return { number: "0x7", timestamp: "0x1", baseFeePerGas: "0x1", transactions: [] };
        case "eth_fillTransaction":
          // "method not found" makes viem fill the transaction field by field
          throw Object.assign(new Error("Method not found"), { code: -32601 });
        case "eth_sendRawTransaction":
          rawTransactions.push((params as [TransactionSerialized])[0]);
          return sendRawTransaction();
      }
      throw new Error(`unexpected: ${method}`);
    });
    const log = sinon.stub(console, "log");
    sinon
      .stub(client.viemClient, "waitForTransactionReceipt")
      .rejects(new WaitForTransactionReceiptTimeoutError({ hash: "0x00" }));

    const error: unknown = await client.write(target, "ping", [], { from: pilot }).catch((rejection) => rejection);

    const hash = keccak256(rawTransactions[0]);
    sinon.assert.calledWith(log, `Sending transaction ${hash}`);
    expect(log.calledBefore(sendRawTransaction)).to.equal(true);
    expect(error).to.have.property("message").that.includes(hash).and.includes("Do not rerun");
  });
});

describe("RpcClient.getLogsInWindows", () => {
  const event = parseAbiItem("event ExecuteVote(uint256 indexed voteId)");
  const address = "0x2e59A20f205bB85a89C53f1936454680651E618e";
  const executeLog = {
    address,
    topics: encodeEventTopics({ abi: [event], args: { voteId: 1n } }),
    data: "0x",
    blockNumber: "0x13ab",
    blockHash: `0x${"11".repeat(32)}`,
    transactionHash: `0x${"22".repeat(32)}`,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };

  function fixture(hitWindow?: number) {
    const ranges: [bigint, bigint][] = [];
    const client = buildRpcClient((method, params) => {
      if (method === "eth_blockNumber") {
        return "0x2774";
      }
      if (method === "eth_getLogs") {
        const [{ fromBlock, toBlock }] = params as [{ fromBlock: string; toBlock: string }];
        ranges.push([BigInt(fromBlock), BigInt(toBlock)]);
        return ranges.length === hitWindow ? [executeLog] : [];
      }
      throw new Error(`unexpected: ${method}`);
    });
    return { client, ranges };
  }

  it("splits the range up to the latest block into windows of 4999 blocks", async () => {
    const { client, ranges } = fixture();

    expect(await client.getLogsInWindows({ address, event, fromBlock: 100n })).to.deep.equal([]);
    expect(ranges).to.deep.equal([
      [100n, 5098n],
      [5099n, 10097n],
      [10098n, 10100n],
    ]);
  });

  it("stops at the first window with logs", async () => {
    const { client, ranges } = fixture(2);

    const logs = await client.getLogsInWindows({ address, event, fromBlock: 100n, toBlock: 20000n }, true);

    expect(logs.map((log) => log.transactionHash)).to.deep.equal([executeLog.transactionHash]);
    expect(ranges).to.have.lengthOf(2);
  });
});
