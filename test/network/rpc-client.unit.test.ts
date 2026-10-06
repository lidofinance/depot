import { expect } from "chai";
import { createWalletClient, custom, publicActions } from "viem";
import { mainnet } from "viem/chains";

import { RpcClient } from "../../src/network/rpc-client";

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
