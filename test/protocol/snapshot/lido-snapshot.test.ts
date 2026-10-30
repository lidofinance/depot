import { assert } from "chai";
import {
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseEther,
  stringToHex,
  zeroAddress,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
} from "viem";
import { Lido_ABI } from "@/abi/Lido.abi";
import { contract } from "@/src/contracts";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import {
  assertSnapshot,
  assertWithinTolerance,
  getSnapshotContext,
  type SnapshotContext,
} from "@/test/protocol/helpers/snapshot";
import { AppProxyUpgradeable_ABI } from "@/abi/AppProxyUpgradeable.abi";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import { readStorageWord } from "@/test/protocol/helpers/storage";

const configurations = {
  mainnet: {
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    stethWhale: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    elVault: "0x388C818CA8B9251b393131C08a736A67ccB19297",
  },
  hoodi: {
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    stethWhale: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
    elVault: "0x9b108015fe433F173696Af3Aa0CF7CDb3E104258",
  },
} as const;
const ethWhale = "0x00000000219ab540356cBB839Cbe05303d7705Fa";
const someContract = "0xcA11bde05977b3631167028862bE2a173976CA11";
const stranger = "0x98eC059dC3aDFbdd63429454aeB0C990fbA4a124";
const oneEth = parseEther("1");
const gasPrice = 2_000_000_000n;

interface Frame {
  name: string;
  snapshot: Record<string, unknown>;
}

describe("Lido upgrade snapshot", function () {
  let context: SnapshotContext;
  let expected: (typeof configurations)[keyof typeof configurations];
  let lido: ReturnType<typeof contract<typeof Lido_ABI>>;
  let governance: ReturnType<typeof getGovernanceContracts>;
  let farBlock: bigint;

  before(async function () {
    context = getSnapshotContext(this);
    const network = context.client.getNetworkName();
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Unsupported snapshot network ${network}`);
    }
    expected = configurations[network];
    lido = contract(Lido_ABI, expected.lido);
    governance = getGovernanceContracts(network);
    farBlock = (await context.client.viemClient.getBlockNumber({ cacheTime: 0 })) + 1_000n;
  });

  async function snapshot(): Promise<Record<string, unknown>> {
    const { client } = context;
    const blockNumber = await client.viemClient.getBlockNumber({ cacheTime: 0 });
    const pauseRole = await client.viemClient.readContract({
      ...lido,
      functionName: "PAUSE_ROLE",
      args: [],
      blockNumber,
    });
    const observations: Record<string, unknown> = {
      block_number: blockNumber,
      address: lido.address,
      isDepositable: await client.viemClient.readContract({
        abi: AppProxyUpgradeable_ABI,
        address: lido.address,
        functionName: "isDepositable",
        blockNumber,
      }),
      name: await client.viemClient.readContract({ ...lido, functionName: "name", args: [], blockNumber }),
      symbol: await client.viemClient.readContract({ ...lido, functionName: "symbol", args: [], blockNumber }),
      decimals: await client.viemClient.readContract({ ...lido, functionName: "decimals", args: [], blockNumber }),
      totalSupply: await client.viemClient.readContract({
        ...lido,
        functionName: "totalSupply",
        args: [],
        blockNumber,
      }),
      "balanceOf(eth_whale)": await client.viemClient.readContract({
        ...lido,
        functionName: "balanceOf",
        args: [ethWhale],
        blockNumber,
      }),
      "balanceOf(steth_whale)": await client.viemClient.readContract({
        ...lido,
        functionName: "balanceOf",
        args: [expected.stethWhale],
        blockNumber,
      }),
      "balanceOf(stranger)": await client.viemClient.readContract({
        ...lido,
        functionName: "balanceOf",
        args: [stranger],
        blockNumber,
      }),
      "allowance(steth_whale,stranger)": await client.viemClient.readContract({
        ...lido,
        functionName: "allowance",
        args: [expected.stethWhale, stranger],
        blockNumber,
      }),
      "allowance(stranger,steth_whale)": await client.viemClient.readContract({
        ...lido,
        functionName: "allowance",
        args: [stranger, expected.stethWhale],
        blockNumber,
      }),
      "sharesOf(eth_whale)": await client.viemClient.readContract({
        ...lido,
        functionName: "sharesOf",
        args: [ethWhale],
        blockNumber,
      }),
      "sharesOf(steth_whale)": await client.viemClient.readContract({
        ...lido,
        functionName: "sharesOf",
        args: [expected.stethWhale],
        blockNumber,
      }),
      "sharesOf(stranger)": await client.viemClient.readContract({
        ...lido,
        functionName: "sharesOf",
        args: [stranger],
        blockNumber,
      }),
      getBeaconStat: await client.viemClient.readContract({
        ...lido,
        functionName: "getBeaconStat",
        args: [],
        blockNumber,
      }),
      getBufferedEther: await client.viemClient.readContract({
        ...lido,
        functionName: "getBufferedEther",
        args: [],
        blockNumber,
      }),
      getTotalPooledEther: await client.viemClient.readContract({
        ...lido,
        functionName: "getTotalPooledEther",
        args: [],
        blockNumber,
      }),
      "getPooledEthByShares(100)": await client.viemClient.readContract({
        ...lido,
        functionName: "getPooledEthByShares",
        args: [100n],
        blockNumber,
      }),
      getCurrentStakeLimit: await client.viemClient.readContract({
        ...lido,
        functionName: "getCurrentStakeLimit",
        args: [],
        blockNumber,
      }),
      getFee: await client.viemClient.readContract({ ...lido, functionName: "getFee", args: [], blockNumber }),
      getStakeLimitFullInfo: await client.viemClient.readContract({
        ...lido,
        functionName: "getStakeLimitFullInfo",
        args: [],
        blockNumber,
      }),
      getTotalELRewardsCollected: await client.viemClient.readContract({
        ...lido,
        functionName: "getTotalELRewardsCollected",
        args: [],
        blockNumber,
      }),
      getTotalShares: await client.viemClient.readContract({
        ...lido,
        functionName: "getTotalShares",
        args: [],
        blockNumber,
      }),
      "getSharesByPooledEth(1 ETH)": await client.viemClient.readContract({
        ...lido,
        functionName: "getSharesByPooledEth",
        args: [oneEth],
        blockNumber,
      }),
      getTreasury: await client.viemClient.readContract({
        ...lido,
        functionName: "getTreasury",
        args: [],
        blockNumber,
      }),
      getWithdrawalCredentials: await client.viemClient.readContract({
        ...lido,
        functionName: "getWithdrawalCredentials",
        args: [],
        blockNumber,
      }),
      isStakingPaused: await client.viemClient.readContract({
        ...lido,
        functionName: "isStakingPaused",
        args: [],
        blockNumber,
      }),
      isPetrified: await client.viemClient.readContract({
        ...lido,
        functionName: "isPetrified",
        args: [],
        blockNumber,
      }),
      isStopped: await client.viemClient.readContract({ ...lido, functionName: "isStopped", args: [], blockNumber }),
      "allowRecoverability(LDO)": await client.viemClient.readContract({
        ...lido,
        functionName: "allowRecoverability",
        args: [governance.ldo.address],
        blockNumber,
      }),
      "allowRecoverability(StETH)": await client.viemClient.readContract({
        ...lido,
        functionName: "allowRecoverability",
        args: [lido.address],
        blockNumber,
      }),
      "allowRecoverability(SOME_CONTRACT)": await client.viemClient.readContract({
        ...lido,
        functionName: "allowRecoverability",
        args: [someContract],
        blockNumber,
      }),
      RESUME_ROLE: await client.viemClient.readContract({
        ...lido,
        functionName: "RESUME_ROLE",
        args: [],
        blockNumber,
      }),
      STAKING_CONTROL_ROLE: await client.viemClient.readContract({
        ...lido,
        functionName: "STAKING_CONTROL_ROLE",
        args: [],
        blockNumber,
      }),
      STAKING_PAUSE_ROLE: await client.viemClient.readContract({
        ...lido,
        functionName: "STAKING_PAUSE_ROLE",
        args: [],
        blockNumber,
      }),
      "canPerform()": await client.viemClient.readContract({
        ...lido,
        functionName: "canPerform",
        args: [governance.voting.address, pauseRole, []],
        blockNumber,
      }),
      getRecoveryVault: await client.viemClient.readContract({
        ...lido,
        functionName: "getRecoveryVault",
        args: [],
        blockNumber,
      }),
      kernel: await client.viemClient.readContract({ ...lido, functionName: "kernel", args: [], blockNumber }),
      appId: await client.viemClient.readContract({ ...lido, functionName: "appId", args: [], blockNumber }),
      "getEVMScriptExecutor(nil)": await client.viemClient.readContract({
        ...lido,
        functionName: "getEVMScriptExecutor",
        args: ["0x00000001"],
        blockNumber,
      }),
      getEVMScriptRegistry: await client.viemClient.readContract({
        ...lido,
        functionName: "getEVMScriptRegistry",
        args: [],
        blockNumber,
      }),
      getInitializationBlock: await client.viemClient.readContract({
        ...lido,
        functionName: "getInitializationBlock",
        args: [],
        blockNumber,
      }),
      hasInitialized: await client.viemClient.readContract({
        ...lido,
        functionName: "hasInitialized",
        args: [],
        blockNumber,
      }),
      PAUSE_ROLE: pauseRole,
    };
    // Scripts only requires this deprecated getter not to revert
    await client.viemClient.readContract({ ...lido, functionName: "getFeeDistribution", args: [], blockNumber });
    for (const slot of [
      "lido.Lido.beaconBalance",
      "lido.Lido.beaconValidators",
      "lido.Lido.bufferedEther",
      "lido.Lido.depositContract",
      "lido.Lido.lidoLocator",
      "lido.Lido.depositedValidators",
      "lido.Lido.ELRewardsWithdrawalLimit",
      "lido.Lido.executionLayerRewardsVault",
      "lido.Lido.fee",
      "lido.Lido.insuranceFee",
      "lido.Lido.insuranceFund",
      "lido.Lido.nodeOperatorsFee",
      "lido.Lido.nodeOperatorsRegistry",
      "lido.Lido.oracle",
      "lido.Lido.stakeLimit",
      "lido.Lido.totalELRewardsCollected",
      "lido.Lido.treasury",
      "lido.Lido.treasuryFee",
      "lido.Lido.withdrawalCredentials",
      "lido.Lido.lidoLocatorAndMaxExternalRatio",
      "lido.Lido.clValidatorsBalanceAndClPendingBalance",
      "lido.Lido.bufferedEtherAndDepositedPostReport",
      "lido.Lido.depositedNextReportAndLastDepositNonce",
      "lido.Lido.seedDepositsCount",
      "lido.Lido.depositsReserve",
      "lido.Lido.depositsReserveTarget",
      "lido.StETH.totalShares",
      "lido.StETH.totalAndExternalShares",
      "lido.Pausable.activeFlag",
      "aragonOS.appStorage.kernel",
      "aragonOS.appStorage.appId",
    ]) {
      observations[slot] = await readStorageWord(client, lido.address, keccak256(stringToHex(slot)), blockNumber);
    }
    return observations;
  }

  async function transact(
    functionName: ContractFunctionName<typeof Lido_ABI, "payable" | "nonpayable">,
    args: ContractFunctionArgs<typeof Lido_ABI, "payable" | "nonpayable">,
    from: Address,
    value = 0n,
  ): Promise<void> {
    const { client } = context;
    const hash = await client.viemClient.sendTransaction({
      account: from,
      to: lido.address,
      data: encodeFunctionData({ abi: Lido_ABI, functionName, args }),
      value,
      gasPrice,
      chain: client.viemClient.chain,
    });
    const receipt = await client.viemClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", functionName);
  }

  async function grantPermissions(): Promise<void> {
    const { client } = context;
    const accounts = new ImpersonatedAccounts();
    try {
      await accounts.impersonate(client, expected.agent);
      for (const name of ["PAUSE_ROLE", "RESUME_ROLE", "STAKING_PAUSE_ROLE", "STAKING_CONTROL_ROLE"] as const) {
        const role = await client.read(lido, name);
        const hash = await client.viemClient.writeContract({
          ...governance.acl,
          functionName: "grantPermission",
          args: [expected.agent, lido.address, role],
          account: expected.agent,
          gasPrice,
          chain: client.viemClient.chain,
        });
        const receipt = await client.viemClient.waitForTransactionReceipt({ hash });
        assert.equal(receipt.status, "success", `grant ${name}`);
      }
    } finally {
      await accounts.stopAll(client);
    }
  }

  async function compareUpgrade(
    scenario: string,
    actions: readonly (readonly [string, () => Promise<unknown>])[],
    prepare?: () => Promise<void>,
  ): Promise<void> {
    const { client, testUpgrade } = context;
    let oldFrames: Frame[];
    async function run(): Promise<Frame[]> {
      await grantPermissions();
      const accounts = new ImpersonatedAccounts();
      try {
        for (const sender of [ethWhale, someContract, stranger, expected.elVault, expected.agent] as const) {
          await accounts.impersonate(client, sender, { preserveBalance: true });
        }
        const block = await client.viemClient.getBlockNumber({ cacheTime: 0 });
        if (block > farBlock) {
          throw new Error(`Current block ${block} exceeds snapshot target ${farBlock}`);
        }
        if (block < farBlock) {
          await client.mine(farBlock - block, 1);
        }
        const frames: Frame[] = [{ name: "init", snapshot: await snapshot() }];
        for (const [name, action] of actions) {
          await action();
          frames.push({ name, snapshot: await snapshot() });
        }
        return frames;
      } finally {
        await accounts.stopAll(client);
      }
    }
    await testUpgrade({
      beforeExecution: async () => {
        for (const sender of [ethWhale, someContract, stranger, expected.elVault] as const) {
          await client.setBalance(sender, parseEther("100000"));
        }
        if (prepare) {
          await prepare();
        }
        oldFrames = await client.withSnapshot(run);
      },
      afterExecution: async () => {
        const newFrames = await run();
        assert.equal(newFrames.length, oldFrames.length, "frame count");
        for (let index = 0; index < oldFrames.length; index++) {
          const before = oldFrames[index];
          const after = newFrames[index];
          assert.equal(after.name, before.name, "frame name");
          const scope = `lido-snapshot/${scenario}/${before.name}`;
          const oldState = { ...before.snapshot };
          const newState = { ...after.snapshot };
          assertWithinTolerance(context, scope, "getPooledEthByShares(100)", oldState, newState, 2n);
          assertSnapshot(context, scope, oldState, newState);
        }
      },
    });
  }

  it("preserves views and named storage after mining a block", async function () {
    await compareUpgrade("views", [["mine", () => context.client.mine(1)]]);
  });

  it("preserves the ordered user transfers and allowances", async function () {
    const halfAmount = (oneEth - 42n) / 2n;
    await compareUpgrade(
      "user-actions",
      [
        [
          "receive",
          async () => {
            const { client } = context;
            const hash = await client.viemClient.sendTransaction({
              account: ethWhale,
              to: lido.address,
              value: halfAmount,
              gasPrice,
              chain: client.viemClient.chain,
            });
            assert.equal((await client.viemClient.waitForTransactionReceipt({ hash })).status, "success", "receive");
          },
        ],
        ["submit", () => transact("submit", [zeroAddress], ethWhale, halfAmount)],
        ["approve-max", () => transact("approve", [someContract, maxUint256], ethWhale)],
        ["decrease-allowance", () => transact("decreaseAllowance", [someContract, 13n], ethWhale)],
        ["increase-allowance", () => transact("increaseAllowance", [someContract, 13n], ethWhale)],
        ["approve-42", () => transact("approve", [someContract, 42n], ethWhale)],
        ["transfer-from", () => transact("transferFrom", [ethWhale, someContract, 42n], someContract)],
        ["transfer-to-stranger", () => transact("transfer", [stranger, 17n], ethWhale)],
        ["transfer-shares", () => transact("transferShares", [stranger, 23n], someContract)],
        ["revoke-allowance", () => transact("approve", [someContract, 0n], ethWhale)],
        ["transfer-to-whale", () => transact("transfer", [ethWhale, 11n], stranger)],
        ["transfer-to-contract", () => transact("transfer", [someContract, 13n], stranger)],
      ],
      async () => {
        assert.isTrue((await context.client.getBalance(ethWhale)) >= oneEth - 42n, "whale ETH balance");
        assert.equal(await context.client.read(lido, "balanceOf", [ethWhale]), 0n, "initial whale stETH balance");
      },
    );
  });

  it("preserves deposits, stop/resume and EL rewards", async function () {
    await compareUpgrade(
      "send-ether",
      [
        ["submit-zero-referral", () => transact("submit", [zeroAddress], ethWhale, 42n)],
        ["submit-whale-referral", () => transact("submit", [expected.stethWhale], ethWhale, 42n)],
        ["stop", () => transact("stop", [], expected.agent)],
        ["resume", () => transact("resume", [], expected.agent)],
        ["submit-after-resume", () => transact("submit", [zeroAddress], ethWhale, 17n)],
        ["receive-el-rewards", () => transact("receiveELRewards", [], expected.elVault, oneEth - 42n)],
        ["submit-after-rewards", () => transact("submit", [expected.stethWhale], ethWhale, 13n)],
      ],
      async () => {
        assert.equal(await context.client.read(lido, "balanceOf", [ethWhale]), 0n, "initial whale stETH balance");
        assert.isTrue((await context.client.getBalance(ethWhale)) >= oneEth, "whale ETH balance");
      },
    );
  });

  it("preserves the ordered DAO staking controls", async function () {
    await compareUpgrade(
      "dao-operations",
      [
        ["pause-staking", () => transact("pauseStaking", [], expected.agent)],
        ["stop", () => transact("stop", [], expected.agent)],
        ["resume", () => transact("resume", [], expected.agent)],
        ["pause-staking-again", () => transact("pauseStaking", [], expected.agent)],
        ["remove-staking-limit", () => transact("removeStakingLimit", [], expected.agent)],
        ["resume-staking", () => transact("resumeStaking", [], expected.agent)],
        ["receive-el-rewards", () => transact("receiveELRewards", [], expected.elVault, oneEth)],
        ["pause-before-limit", () => transact("pauseStaking", [], expected.agent)],
        ["set-staking-limit", () => transact("setStakingLimit", [17n, 3n], expected.agent)],
        ["stop-final", () => transact("stop", [], expected.agent)],
      ],
      async () => {
        assert.isTrue((await context.client.read(lido, "getCurrentStakeLimit")) > 0n, "initial stake limit");
        assert.isFalse(await context.client.read(lido, "isStakingPaused"), "initial staking paused");
        assert.isFalse(await context.client.read(lido, "isStopped"), "initial stopped");
      },
    );
  });
});
