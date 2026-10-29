import { parseEther, type Address } from "viem";
import { DevRpcClient } from "@/src/network";

// Snapshot revert does not end impersonation sessions, so they are closed explicitly
export class ImpersonatedAccounts {
  readonly #accounts = new Set<Address>();

  async impersonate(client: DevRpcClient, account: Address): Promise<void> {
    await client.impersonate(account, parseEther("10"));
    this.#accounts.add(account);
  }

  async stopAll(client: DevRpcClient): Promise<void> {
    try {
      for (const account of this.#accounts) {
        await client.stopImpersonating(account);
      }
    } finally {
      this.#accounts.clear();
    }
  }
}
