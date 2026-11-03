import { expect } from "chai";
import sinon from "sinon";
import {
  createWalletClient,
  custom,
  keccak256,
  publicActions,
  TransactionSerialized,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { contract } from "@/src/contracts/contracts";
import { RpcClient } from "@/src/network/rpc-client";

type RpcHandler = (method: string, params: unknown[]) => unknown;

function buildRpcClient(handler: RpcHandler, rpcUrl?: string): RpcClient {
  const provider = {
    request: ({ method, params }: { method: string; params?: unknown[] }) =>
      Promise.resolve(handler(method, params ?? [])),
  };
  const transport = custom(provider);
  const viemClient = createWalletClient({ chain: mainnet, transport }).extend(publicActions);
  if (rpcUrl !== undefined) {
    (viemClient.transport as Record<string, unknown>)["url"] = rpcUrl;
  }
  return new RpcClient("mainnet", viemClient as unknown as ConstructorParameters<typeof RpcClient>[1]);
}

describe("RpcClient.getNodeInfo", () => {
  it("classifies hardhat clientVersion strings", async () => {
    const client = buildRpcClient((method) => {
      if (method === "web3_clientVersion") return "HardhatNetwork/2.22.12/@nomicfoundation/edr";
      throw new Error(`unexpected: ${method}`);
    });

    const info = await client.getNodeInfo();
    expect(info.name).to.equal("hardhat");
    expect(info.version).to.equal("2.22.12");
  });

  it("classifies anvil clientVersion strings", async () => {
    const client = buildRpcClient((method) => {
      if (method === "web3_clientVersion") return "anvil/v0.2.0";
      throw new Error(`unexpected: ${method}`);
    });

    const info = await client.getNodeInfo();
    expect(info.name).to.equal("anvil");
    expect(info.version).to.equal("v0.2.0");
  });

  it("preserves unknown client name instead of falsely classifying", async () => {
    const client = buildRpcClient((method) => {
      if (method === "web3_clientVersion") return "Geth/v1.13.0/linux-amd64/go1.21.1";
      throw new Error(`unexpected: ${method}`);
    });

    const info = await client.getNodeInfo();
    expect(info.name).to.equal("geth");
    expect(info.version).to.equal("v1.13.0");
  });

  it("caches node info across calls (single RPC request)", async () => {
    let calls = 0;
    const client = buildRpcClient((method) => {
      if (method === "web3_clientVersion") {
        calls += 1;
        return "HardhatNetwork/2.22.12/@nomicfoundation/edr";
      }
      throw new Error(`unexpected: ${method}`);
    });

    await client.getNodeInfo();
    await client.getNodeInfo();
    await client.getNodeInfo();

    expect(calls).to.equal(1);
  });
});

describe("RpcClient accessors", () => {
  it("returns the configured network name", () => {
    const client = buildRpcClient(() => undefined);
    expect(client.getNetworkName()).to.equal("mainnet");
  });

  it("exposes the transport URL when available", () => {
    const client = buildRpcClient(() => undefined, "https://rpc.example/endpoint");
    expect(client.getRpcUrl()).to.equal("https://rpc.example/endpoint");
  });

  it("returns null when transport has no URL (custom provider)", () => {
    const client = buildRpcClient(() => undefined);
    expect(client.getRpcUrl()).to.equal(null);
  });
});

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
