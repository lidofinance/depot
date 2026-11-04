import { expect } from "chai";
import { EthereumProvider } from "hardhat/types/providers";

import { createRpcClient, createDevRpcClient, getLocalRpcUrl, HOODI_CHAIN_ID } from "@/src/network/network";

type RpcHandler = (method: string, params: unknown[]) => unknown;

function makeProvider(handler: RpcHandler): EthereumProvider {
  const fake = {
    request: ({ method, params }: { method: string; params?: unknown[] }) =>
      Promise.resolve(handler(method, params ?? [])),
    on: () => fake,
    once: () => fake,
    off: () => fake,
    removeListener: () => fake,
    addListener: () => fake,
    send: () => undefined,
    sendAsync: () => undefined,
  };
  return fake as unknown as EthereumProvider;
}

function chainIdHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

describe("network: getLocalRpcUrl", () => {
  it("rejects a URL, so a remote node cannot pass for the local one", () => {
    expect(() => getLocalRpcUrl("https://node.example")).to.throw("must be a port number");
  });
});

describe("network: client factories (provider overload)", () => {
  it("createRpcClient throws when chainId does not match the requested network", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") {
        return chainIdHex(HOODI_CHAIN_ID);
      }
      throw new Error(`unexpected method: ${method}`);
    });

    try {
      await createRpcClient("mainnet", provider);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.match(/Unexpected chain id/);
    }
  });

  it("createDevRpcClient throws when chainId is neither hardhat nor the requested network", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") {
        return chainIdHex(HOODI_CHAIN_ID);
      }
      if (method === "web3_clientVersion") {
        return "anvil/v0.2.0";
      }
      throw new Error(`unexpected method: ${method}`);
    });

    try {
      await createDevRpcClient("mainnet", provider);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.match(/Unexpected chain id/);
    }
  });
});
