import { parseEther, type Address } from "viem";
import { DevRpcClient } from "@/src/network";

// Snapshot revert does not end impersonation sessions, so they are closed explicitly
export class ImpersonatedAccounts {
  readonly #accounts = new Set<Address>();

  async impersonate(
    client: DevRpcClient,
    account: Address,
    { preserveBalance = false }: { preserveBalance?: boolean } = {},
  ): Promise<void> {
    await client.impersonate(account, preserveBalance ? undefined : parseEther("10"));
    this.#accounts.add(account);
  }

  async stopAll(client: DevRpcClient): Promise<void> {
    const errors: unknown[] = [];
    for (const account of this.#accounts) {
      try {
        await client.stopImpersonating(account);
        this.#accounts.delete(account);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to stop impersonating accounts");
    }
  }
}
