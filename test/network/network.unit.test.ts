import { expect } from "chai";
import { EthereumProvider } from "hardhat/types";

import {
  createRpcClient,
  createDevRpcClient,
  getChainIdByNetworkName,
  getNetworkNameByChainId,
  getLocalRpcUrl,
  getRpcUrl,
  MAINNET_CHAIN_ID,
  HOLESKY_CHAIN_ID,
  HOODI_CHAIN_ID,
} from "../../src/network/network";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { RpcClient } from "../../src/network/rpc-client";

const HARDHAT_CHAIN_ID = 31337;

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

describe("network: pure helpers", () => {
  describe("getChainIdByNetworkName", () => {
    it("maps supported networks", () => {
      expect(getChainIdByNetworkName("mainnet")).to.equal(MAINNET_CHAIN_ID);
      expect(getChainIdByNetworkName("holesky")).to.equal(HOLESKY_CHAIN_ID);
      expect(getChainIdByNetworkName("hoodi")).to.equal(HOODI_CHAIN_ID);
    });

    it("throws on unknown network", () => {
      expect(() => getChainIdByNetworkName("sepolia")).to.throw(/Unsupported chain/);
    });
  });

  describe("getNetworkNameByChainId", () => {
    it("maps supported chain ids", () => {
      expect(getNetworkNameByChainId(MAINNET_CHAIN_ID)).to.equal("mainnet");
      expect(getNetworkNameByChainId(HOLESKY_CHAIN_ID)).to.equal("holesky");
      expect(getNetworkNameByChainId(HOODI_CHAIN_ID)).to.equal("hoodi");
    });

    it("throws on unknown chain id", () => {
      expect(() => getNetworkNameByChainId(11155111)).to.throw(/Unsupported chain/);
    });
  });

  describe("getLocalRpcUrl", () => {
    it("builds localhost URL from numeric port", () => {
      expect(getLocalRpcUrl(8545)).to.equal("http://localhost:8545");
    });

    it("builds localhost URL from string port", () => {
      expect(getLocalRpcUrl("19545")).to.equal("http://localhost:19545");
    });

    it("returns input unchanged when already an http URL", () => {
      expect(getLocalRpcUrl("http://other:8545")).to.equal("http://other:8545");
      expect(getLocalRpcUrl("https://node.example")).to.equal("https://node.example");
    });
  });

  describe("getRpcUrl", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns the configured URL for mainnet", () => {
      process.env.ETH_MAINNET_RPC_URL = "https://mainnet.example/rpc";
      expect(getRpcUrl("mainnet")).to.equal("https://mainnet.example/rpc");
    });

    it("splits CSV and indexes by modulo", () => {
      process.env.ETH_HOLESKY_RPC_URL = "https://a.example,https://b.example,https://c.example";
      expect(getRpcUrl("holesky", 0)).to.equal("https://a.example");
      expect(getRpcUrl("holesky", 1)).to.equal("https://b.example");
      expect(getRpcUrl("holesky", 2)).to.equal("https://c.example");
      expect(getRpcUrl("holesky", 5)).to.equal("https://c.example");
    });

    it("throws when env var is not set", () => {
      delete process.env.ETH_MAINNET_RPC_URL;
      expect(() => getRpcUrl("mainnet")).to.throw();
    });
  });
});

describe("network: client factories (provider overload)", () => {
  it("createRpcClient returns RpcClient when chainId matches", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(MAINNET_CHAIN_ID);
      throw new Error(`unexpected method: ${method}`);
    });

    const client = await createRpcClient("mainnet", provider);

    expect(client).to.be.instanceOf(RpcClient);
    expect(client.getNetworkName()).to.equal("mainnet");
  });

  it("createRpcClient throws when chainId does not match the requested network", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(HOLESKY_CHAIN_ID);
      throw new Error(`unexpected method: ${method}`);
    });

    try {
      await createRpcClient("mainnet", provider);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.match(/Unexpected chain id/);
    }
  });

  it("createRpcClient treats a hardhat chainId as valid local dev", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(HARDHAT_CHAIN_ID);
      throw new Error(`unexpected method: ${method}`);
    });

    const client = await createRpcClient("mainnet", provider);
    expect(client).to.be.instanceOf(RpcClient);
  });

  it("createDevRpcClient returns DevRpcClient when chainId matches", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(MAINNET_CHAIN_ID);
      throw new Error(`unexpected method: ${method}`);
    });

    const client = await createDevRpcClient("mainnet", provider);

    expect(client).to.be.instanceOf(DevRpcClient);
    expect(client).to.be.instanceOf(RpcClient);
  });

  it("createDevRpcClient returns DevRpcClient for hardhat chainId regardless of requested network", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(HARDHAT_CHAIN_ID);
      throw new Error(`unexpected method: ${method}`);
    });

    const client = await createDevRpcClient("mainnet", provider);

    expect(client).to.be.instanceOf(DevRpcClient);
  });

  it("createDevRpcClient throws when chainId is neither hardhat nor the requested network", async () => {
    const provider = makeProvider((method) => {
      if (method === "eth_chainId") return chainIdHex(HOODI_CHAIN_ID);
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
