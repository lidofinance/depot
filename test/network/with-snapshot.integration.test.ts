import { assert } from "chai";
import { Address } from "viem";

import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";

const MOCK_ERC20_MINT_SELECTOR = "0x40c10f19"; // mint(address,uint256)

describe("DevRpcClient.withSnapshot (integration)", function () {
  let client: DevRpcClient;
  let mocks: MockGovernanceContracts;
  let deployer: Address;
  let holder: Address;

  before(async function () {
    client = await createInProcessDevRpcClient();
    [deployer, holder] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);

    // Seed holder with some LDO so every test starts from non-zero balance.
    await client.impersonate(deployer);
    const mintInitial = (MOCK_ERC20_MINT_SELECTOR +
      holder.slice(2).padStart(64, "0") +
      (1000n * 10n ** 18n).toString(16).padStart(64, "0")) as `0x${string}`;
    await client.send("eth_sendTransaction", [{ from: deployer, to: mocks.ldo.address, data: mintInitial }]);
  });

  async function mintLdo(to: Address, amount: bigint): Promise<void> {
    await client.impersonate(deployer);
    const data = (MOCK_ERC20_MINT_SELECTOR +
      to.slice(2).padStart(64, "0") +
      amount.toString(16).padStart(64, "0")) as `0x${string}`;
    await client.send("eth_sendTransaction", [{ from: deployer, to: mocks.ldo.address, data }]);
  }

  it("reverts state mutations performed inside the callback", async function () {
    const balanceBefore = await client.read(mocks.ldo, "balanceOf", [holder]);

    await client.withSnapshot(async () => {
      await mintLdo(holder, 500n * 10n ** 18n);
      const insideBalance = await client.read(mocks.ldo, "balanceOf", [holder]);
      assert.equal(insideBalance, balanceBefore + 500n * 10n ** 18n);
    });

    const balanceAfter = await client.read(mocks.ldo, "balanceOf", [holder]);
    assert.equal(balanceAfter, balanceBefore, "state must be reverted after withSnapshot");
  });

  it("returns the callback's resolved value", async function () {
    const result = await client.withSnapshot(async () => {
      await mintLdo(holder, 1n);
      return "ok" as const;
    });
    assert.equal(result, "ok");
  });

  it("reverts state even when the callback throws", async function () {
    const balanceBefore = await client.read(mocks.ldo, "balanceOf", [holder]);

    const err = await client
      .withSnapshot(async () => {
        await mintLdo(holder, 777n * 10n ** 18n);
        throw new Error("callback boom");
      })
      .catch((e: Error) => e);

    assert.instanceOf(err, Error);
    assert.equal((err as Error).message, "callback boom");

    const balanceAfter = await client.read(mocks.ldo, "balanceOf", [holder]);
    assert.equal(balanceAfter, balanceBefore, "state must be reverted even on thrown error");
  });

  it("supports nested withSnapshot", async function () {
    const balanceBefore = await client.read(mocks.ldo, "balanceOf", [holder]);

    await client.withSnapshot(async () => {
      await mintLdo(holder, 100n * 10n ** 18n);
      await client.withSnapshot(async () => {
        await mintLdo(holder, 200n * 10n ** 18n);
      });
      // Outer snapshot still active: inner mint reverted, outer mint still visible.
      const innerReverted = await client.read(mocks.ldo, "balanceOf", [holder]);
      assert.equal(innerReverted, balanceBefore + 100n * 10n ** 18n);
    });

    const balanceAfter = await client.read(mocks.ldo, "balanceOf", [holder]);
    assert.equal(balanceAfter, balanceBefore);
  });
});
