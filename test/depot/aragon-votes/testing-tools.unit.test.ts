import { assert } from "chai";
import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { Address, parseEther } from "viem";
import { LDO_VOTERS_BY_NETWORK_NAME } from "@/src/aragon-votes-tools/constants";
import { passAragonVote } from "@/src/aragon-votes-tools/testing";
import { DevRpcClient } from "@/src/network";

describe("passAragonVote temporary balances", () => {
  afterEach(() => sinon.restore());

  function fixture() {
    const client = sinon.createStubInstance(DevRpcClient);
    const [whale, agent] = LDO_VOTERS_BY_NETWORK_NAME.mainnet;
    const balances = new Map<Address, bigint>([
      [whale, parseEther("1")],
      [agent, parseEther("100")],
    ]);
    const impersonated = new Set<Address>();
    client.getNetworkName.returns("mainnet");
    client.getBalance.callsFake((address) => Promise.resolve(balances.get(address) ?? 0n));
    client.impersonate.callsFake((address, balance) => {
      impersonated.add(address);
      if (balance !== undefined) {
        balances.set(address, balance);
      }
      return Promise.resolve();
    });
    client.stopImpersonating.callsFake((address, balance) => {
      impersonated.delete(address);
      if (balance !== undefined) {
        balances.set(address, balance);
      }
      return Promise.resolve();
    });
    client.read
      .withArgs(sinon.match.any, "getVote", sinon.match.any)
      .resolves([true, false, 0n, 0n, 0n, 1n, 2n, 0n, 2n] as never);
    client.read.withArgs(sinon.match.any, "canVote", sinon.match.any).resolves(true as never);
    client.read.withArgs(sinon.match.any, "canExecute", sinon.match.any).resolves(true as never);
    client.read.withArgs(sinon.match.any, "voteTime", sinon.match.any).resolves(1n as never);
    client.read.withArgs(sinon.match.any, "PCT_BASE", sinon.match.any).resolves(100n as never);
    sinon.stub(console, "log");
    return { client, whale, agent, balances, impersonated };
  }

  it("restores the funded Agent before execution and preserves payload spending", async () => {
    const { client, whale, agent, balances, impersonated } = fixture();
    client.write.callsFake((_contract, method) => {
      if (method === "executeVote") {
        assert.equal(balances.get(agent), parseEther("100"));
        assert.isFalse(impersonated.has(agent));
        balances.set(agent, parseEther("75"));
      }
      return Promise.resolve({} as never);
    });
    await passAragonVote(client, 1n);
    assert.equal(balances.get(agent), parseEther("75"));
    assert.equal(balances.get(whale), parseEther("1"));
    assert.isEmpty([...impersonated]);
  });

  it("restores balances and stops impersonation when voting throws", async () => {
    const { client, agent, balances, impersonated } = fixture();
    client.write.callsFake((_contract, _method, _args, options) => {
      if (options?.from === agent) {
        return Promise.reject(new Error("vote failed"));
      }
      return Promise.resolve({} as never);
    });
    await rejects(passAragonVote(client, 1n), /vote failed/);
    assert.equal(balances.get(agent), parseEther("100"));
    assert.isEmpty([...impersonated]);
  });
});
