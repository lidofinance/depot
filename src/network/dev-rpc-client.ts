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
import { HexStrPrefixed } from "../common/bytes";

type DevTestClientMode = "hardhat" | "anvil";

type PublicTestWalletClient = PublicClient<HttpTransport | CustomTransport, Chain | undefined, undefined> &
  WalletClient<HttpTransport | CustomTransport, Chain | undefined, undefined> &
  TestClient<DevTestClientMode, HttpTransport | CustomTransport, Chain | undefined, undefined>;

export class DevRpcClient extends RpcClient {
  #testClientPromise: Promise<PublicTestWalletClient> | null = null;

  /**
   * Mine `blocks` blocks. When mining more than one block, `interval`
   * (seconds between consecutive block timestamps) must be specified —
   * otherwise hardhat clamps every block to `parent+1`, which rarely matches
   * caller intent when combined with a prior `setTime`/`advanceTime`.
   */
  async mine(blocks: number | bigint, interval?: number | bigint): Promise<void> {
    const blocksN = Number(blocks);
    if (blocksN > 1 && interval === undefined) {
      throw new Error(
        "DevRpcClient.mine: `interval` (seconds between blocks) is required when mining more than one block",
      );
    }

    const params: MineParameters = { blocks: blocksN };
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

  /**
   * Stop impersonating `address`. If `balance` is provided, the account's
   * balance is set to that value after stopping — useful to restore the
   * pre-impersonation balance when `impersonate(addr, tmp)` boosted it.
   */
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

  async revert(snapshotId: HexStrPrefixed): Promise<void> {
    // viem's `revert` drops the result, while the node answers `false` for an unknown or already consumed snapshot
    const reverted = await this.send<"evm_revert", [HexStrPrefixed], boolean>("evm_revert", [snapshotId]);
    if (reverted !== true) {
      throw new Error(`evm_revert for snapshot ${snapshotId} returned false — state was not restored`);
    }
  }

  /**
   * Run a callback against the dev node inside an automatic snapshot/revert pair.
   * A snapshot is taken before the callback, and the state is reverted afterwards
   * — whether the callback resolves or throws. Returns the callback's result.
   */
  async withSnapshot<T>(callback: () => Promise<T> | T): Promise<T> {
    const snapshotId = await this.snapshot();
    let result: T;
    try {
      result = await callback();
    } catch (error) {
      try {
        await this.revert(snapshotId);
      } catch (revertError) {
        // the callback failure is the actionable one, a failed revert only gets reported
        console.error(`Failed to revert snapshot ${snapshotId}: ${(revertError as Error).message}`);
      }
      throw error;
    }
    await this.revert(snapshotId);
    return result;
  }

  /**
   * Mine a block with the given absolute timestamp. Drift-free: after this
   * returns, `getChainTime()` equals `target` exactly. `target` must be
   * greater than the current chain time (EVM rule).
   */
  async setTime(target: number | bigint): Promise<void> {
    const client = await this.#getTestClient();
    await client.setNextBlockTimestamp({ timestamp: BigInt(target) });
    await client.mine({ blocks: 1 });
  }

  /**
   * Advance chain time by `seconds` relative to the current chain time and
   * mine a block. Drift-free: uses an absolute target computed from the last
   * block's timestamp.
   */
  async advanceTime(seconds: number | bigint): Promise<void> {
    const current = await this.getChainTime();
    await this.setTime(BigInt(current) + BigInt(seconds));
  }

  async reset(args?: ResetParameters) {
    const client = await this.#getTestClient();
    await client.reset(args);
  }

  async getAccounts(): Promise<Address[]> {
    return this.send("eth_accounts", []);
  }

  async #getTestClient(): Promise<PublicTestWalletClient> {
    this.#testClientPromise ??= (async () => {
      const node = await this.getNodeInfo();
      if (node.name !== "hardhat" && node.name !== "anvil") {
        throw new Error(`Unsupported RPC node type ${node.name}`);
      }
      return this.viemClient.extend(testActions({ mode: node.name })) as unknown as PublicTestWalletClient;
    })();
    return this.#testClientPromise;
  }
}
