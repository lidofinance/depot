import {
  Address,
  Chain,
  CustomTransport,
  HttpTransport,
  MineParameters,
  PublicClient,
  ResetParameters,
  testActions,
  TestClient,
  WalletClient,
} from "viem";
import { RpcClient } from "./rpc-client";
import { TestClientMode } from "viem/_types/clients/createTestClient";
import { HexStrPrefixed } from "../common/bytes";

type PublicTestWalletClient = PublicClient<HttpTransport | CustomTransport, Chain, undefined> &
  WalletClient<HttpTransport | CustomTransport, Chain, undefined> &
  TestClient<TestClientMode, HttpTransport | CustomTransport, Chain, undefined>;

export class DevRpcClient extends RpcClient {
  #testClient: PublicTestWalletClient | null = null;

  async mine(blocks: number | bigint, interval?: number | bigint): Promise<void> {
    const params: MineParameters = { blocks: Number(blocks) };

    if (interval !== undefined) {
      params.interval = Number(interval);
    }

    const client = await this.#getTestClient();
    await client.mine(params);
  }

  async setBalance(address: Address, balance: bigint) {
    const client = await this.#getTestClient();
    await client.setBalance({ address, value: balance });
  }

  async impersonate(address: Address, balance?: bigint) {
    const client = await this.#getTestClient();
    await client.impersonateAccount({ address });

    if (balance !== undefined) {
      await client.setBalance({ address, value: balance });
    }
  }

  async stopImpersonating(address: Address, balance?: bigint) {
    const client = await this.#getTestClient();
    await client.stopImpersonatingAccount({ address });

    if (balance !== undefined) {
      await client.setBalance({ address, value: balance });
    }
  }

  async snapshot(): Promise<HexStrPrefixed> {
    const client = await this.#getTestClient();
    return client.snapshot();
  }

  async revert(snapshotId: HexStrPrefixed) {
    const client = await this.#getTestClient();
    return client.revert({ id: snapshotId });
  }

  async increaseTime(seconds: number | bigint): Promise<void> {
    const client = await this.#getTestClient();
    await client.increaseTime({ seconds: Number(seconds) });
    await client.mine({ blocks: 1 });
  }

  async reset(args?: ResetParameters) {
    const client = await this.#getTestClient();
    await client.reset(args);
  }

  async getAccounts(): Promise<Address[]> {
    return this.send("eth_accounts", []);
  }

  async #getTestClient() {
    if (!this.#testClient) {
      const node = await this.getNodeInfo();
      if (node.name !== "hardhat" && node.name !== "anvil") {
        throw new Error(`Unsupported RPC node type ${node.name}`);
      }
      this.#testClient = this.viemClient.extend(testActions({ mode: node.name })) as unknown as PublicTestWalletClient;
    }
    return this.#testClient;
  }
}
