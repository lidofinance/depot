import { assert } from "chai";
import { encodeFunctionData, parseEther, zeroAddress, type Address } from "viem";
import { Lido_ABI } from "@/abi/Lido.abi";
import { contract } from "@/src/contracts";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import {
  assertSnapshot,
  assertWithinTolerance,
  getLocalAccount,
  getSnapshotContext,
  type SnapshotContext,
} from "@/test/protocol/helpers/snapshot";

const configurations = {
  mainnet: { lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c" },
  hoodi: { lido: "0x3508A952176b3c15387C97BE809eaffB1982176a", agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD" },
} as const;

describe("Plain submit upgrade snapshot", function () {
  let context: SnapshotContext;
  let expected: (typeof configurations)[keyof typeof configurations];
  let lido: ReturnType<typeof contract<typeof Lido_ABI>>;
  let governance: ReturnType<typeof getGovernanceContracts>;
  let staker: Address;

  before(async function () {
    context = getSnapshotContext(this);
    const network = context.client.getNetworkName();
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Unsupported snapshot network ${network}`);
    }
    expected = configurations[network];
    lido = contract(Lido_ABI, expected.lido);
    governance = getGovernanceContracts(network);
    staker = await getLocalAccount(context.client, 0);
  });

  async function snapshot(): Promise<Record<string, unknown>> {
    const { client } = context;
    const pauseRole = await client.read(lido, "PAUSE_ROLE");
    return {
      address: lido.address,
      name: await client.read(lido, "name"),
      "hasInitialized()": await client.read(lido, "hasInitialized"),
      totalSupply: await client.read(lido, "totalSupply"),
      decimals: await client.read(lido, "decimals"),
      "getRecoveryVault()": await client.read(lido, "getRecoveryVault"),
      "getTotalPooledEther()": await client.read(lido, "getTotalPooledEther"),
      "getTreasury()": await client.read(lido, "getTreasury"),
      "isStopped()": await client.read(lido, "isStopped"),
      "getBufferedEther()": await client.read(lido, "getBufferedEther"),
      "getPooledEthByShares(100)": await client.read(lido, "getPooledEthByShares", [100n]),
      "allowRecoverability(LDO)": await client.read(lido, "allowRecoverability", [governance.ldo.address]),
      "allowRecoverability(StETH)": await client.read(lido, "allowRecoverability", [lido.address]),
      appId: await client.read(lido, "appId"),
      "getInitializationBlock()": await client.read(lido, "getInitializationBlock"),
      symbol: await client.read(lido, "symbol"),
      getEVMScriptRegistry: await client.read(lido, "getEVMScriptRegistry"),
      "getBeaconStat()": await client.read(lido, "getBeaconStat"),
      "getFee()": await client.read(lido, "getFee"),
      kernel: await client.read(lido, "kernel"),
      "getTotalShares()": await client.read(lido, "getTotalShares"),
      "isPetrified()": await client.read(lido, "isPetrified"),
      "getSharesByPooledEth(1 ETH)": await client.read(lido, "getSharesByPooledEth", [parseEther("1")]),
      "allowance(accounts[0], TREASURY)": await client.read(lido, "allowance", [staker, expected.agent]),
      "balanceOf(TREASURY)": await client.read(lido, "balanceOf", [expected.agent]),
      "sharesOf(TREASURY)": await client.read(lido, "sharesOf", [expected.agent]),
      "allowance(accounts[0], VOTING)": await client.read(lido, "allowance", [staker, governance.voting.address]),
      "balanceOf(accounts[0])": await client.read(lido, "balanceOf", [staker]),
      "sharesOf(accounts[0])": await client.read(lido, "sharesOf", [staker]),
      "canPerform()": await client.read(lido, "canPerform", [governance.voting.address, pauseRole, []]),
      "getEVMScriptExecutor()": await client.read(lido, "getEVMScriptExecutor", ["0x00000001"]),
      STAKING_CONTROL_ROLE: await client.read(lido, "STAKING_CONTROL_ROLE"),
      RESUME_ROLE: await client.read(lido, "RESUME_ROLE"),
      "isStakingPaused()": await client.read(lido, "isStakingPaused"),
      STAKING_PAUSE_ROLE: await client.read(lido, "STAKING_PAUSE_ROLE"),
      "getTotalELRewardsCollected()": await client.read(lido, "getTotalELRewardsCollected"),
      PAUSE_ROLE: pauseRole,
    };
  }

  async function steps(): Promise<Record<string, Record<string, unknown>>> {
    const { client } = context;
    const init = await snapshot();
    const hash = await client.viemClient.sendTransaction({
      account: staker,
      to: lido.address,
      data: encodeFunctionData({ abi: Lido_ABI, functionName: "submit", args: [zeroAddress] }),
      value: parseEther("1"),
      gasPrice: 2_000_000_000n,
      chain: client.viemClient.chain,
    });
    assert.equal((await client.viemClient.waitForTransactionReceipt({ hash })).status, "success", "submit");
    return { init, submit: await snapshot() };
  }

  it("preserves the initial state and the state after a one ETH submit", async function () {
    let before: Record<string, Record<string, unknown>>;
    await context.testUpgrade({
      beforeExecution: async () => {
        before = await context.client.withSnapshot(steps);
      },
      afterExecution: async () => {
        const after = await steps();
        assert.sameMembers(Object.keys(after), Object.keys(before), "snapshot steps");
        for (const step of Object.keys(before)) {
          const scope = `plain-submit/${step}`;
          const oldState = { ...before[step] };
          const newState = { ...after[step] };
          assertWithinTolerance(context, scope, "getPooledEthByShares(100)", oldState, newState, 2n);
          assertSnapshot(context, scope, oldState, newState);
        }
      },
    });
  });
});
