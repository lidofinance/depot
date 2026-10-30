import { assert } from "chai";
import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { DepositSecurityModule_ABI } from "@/abi/DepositSecurityModule.abi";
import { contract } from "@/src/contracts";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import { sendAsOracleMember } from "@/test/protocol/helpers/oracle";
import {
  assertSnapshot,
  assertWithinTolerance,
  getLocalAccount,
  getSnapshotContext,
} from "@/test/protocol/helpers/snapshot";

const configurations = {
  mainnet: {
    dsm: "0x39BB5d491e98A44D1bfe8047A737a81E296a63E0",
    candidates: ["0xC4f2704273598d51A0ec76A31C12553ec8f5A891", "0xE75A431A98487DC69A14Bdd13d858E3238e9C1b3"],
  },
  hoodi: {
    dsm: "0x8E63F0aF403ffd3Cbd5dB18b4ee632314ab49B51",
    candidates: ["0x929de74c921f3e719Ad2bb026EDeF747d443dC8E", "0x9F81976E461B82cfe3CAec06De8eFA8aD5543408"],
  },
} as const;
// DSM v5 uses ERC-1271 guardian signatures; the checked-in ABI predates that overload.
const pauseAbi = parseAbi(["function pauseDeposits(uint256 blockNumber, (address guardian, bytes signature) sig)"]);

describe("DepositSecurityModule upgrade snapshots", function () {
  for (const operations of [false, true]) {
    it(`preserves views${operations ? " through owner and guardian operations" : ""}`, async function () {
      const context = getSnapshotContext(this);
      const { client, testUpgrade } = context;
      const network = client.getNetworkName();
      if (network !== "mainnet" && network !== "hoodi") {
        throw new Error(`Unsupported snapshot network ${network}`);
      }
      const expected = configurations[network];
      const dsm = contract(DepositSecurityModule_ABI, expected.dsm);
      const [candidate1, candidate2] = expected.candidates;
      const caseName = operations ? "operations" : "views";
      let guardian: Address;
      let negative: Address;
      let newOwner: Address;
      let targetBlock: bigint;
      let targetTime: bigint;
      let before: Record<string, Record<string, unknown>>;

      async function snapshot(): Promise<Record<string, unknown>> {
        return {
          chain_time: BigInt(await client.getChainTime()),
          DEPOSIT_CONTRACT: await client.read(dsm, "DEPOSIT_CONTRACT"),
          getOwner: await client.read(dsm, "getOwner"),
          "getGuardianIndex(positive)": await client.read(dsm, "getGuardianIndex", [guardian]),
          "getGuardianIndex(negative)": await client.read(dsm, "getGuardianIndex", [negative]),
          "getGuardianIndex(changes)": await client.read(dsm, "getGuardianIndex", [candidate1]),
          getGuardianQuorum: await client.read(dsm, "getGuardianQuorum"),
          getGuardians: await client.read(dsm, "getGuardians"),
          "isGuardian(positive)": await client.read(dsm, "isGuardian", [guardian]),
          "isGuardian(negative)": await client.read(dsm, "isGuardian", [negative]),
          "isGuardian(changes)": await client.read(dsm, "isGuardian", [candidate1]),
          getPauseIntentValidityPeriodBlocks: await client.read(dsm, "getPauseIntentValidityPeriodBlocks"),
          getMaxOperatorsPerUnvetting: await client.read(dsm, "getMaxOperatorsPerUnvetting"),
          getLastDepositBlock: await client.read(dsm, "getLastDepositBlock"),
          isDepositsPaused: await client.read(dsm, "isDepositsPaused"),
          address: dsm.address,
          ATTEST_MESSAGE_PREFIX: await client.read(dsm, "ATTEST_MESSAGE_PREFIX"),
          PAUSE_MESSAGE_PREFIX: await client.read(dsm, "PAUSE_MESSAGE_PREFIX"),
        };
      }

      async function send(data: Hex, sender: Address): Promise<void> {
        const hash = await client.viemClient.sendTransaction({
          account: sender,
          to: dsm.address,
          data,
          chain: client.viemClient.chain,
          gasPrice: 2_000_000_000n,
        });
        assert.equal(
          (await client.viemClient.waitForTransactionReceipt({ hash })).status,
          "success",
          "DSM scenario transaction",
        );
      }

      async function run(): Promise<Record<string, Record<string, unknown>>> {
        const impersonated = new ImpersonatedAccounts();
        try {
          const currentBlock = await client.viemClient.getBlockNumber({ cacheTime: 0 });
          assert.isTrue(currentBlock <= targetBlock, "DSM target block has not been exceeded");
          const blocks = targetBlock - currentBlock;
          if (blocks > 0n) {
            await client.send("evm_setNextBlockTimestamp", [Number(targetTime - blocks + 1n)]);
            await client.mine(blocks, 1);
          }
          const frames: Record<string, Record<string, unknown>> = { init: await snapshot() };
          if (!operations) {
            return frames;
          }
          const owner = await client.read(dsm, "getOwner");
          await impersonated.impersonate(client, owner, { preserveBalance: true });
          await impersonated.impersonate(client, newOwner, { preserveBalance: true });
          const actions: readonly [string, () => Promise<unknown>][] = [
            [
              "pauseDeposits",
              async () => {
                const [member] = await client.read(dsm, "getGuardians");
                const data = encodeFunctionData({
                  abi: pauseAbi,
                  functionName: "pauseDeposits",
                  args: [
                    await client.viemClient.getBlockNumber({ cacheTime: 0 }),
                    { guardian: member, signature: "0x" },
                  ],
                });
                if (!(await client.viemClient.getCode({ address: member }))) {
                  await impersonated.impersonate(client, member, { preserveBalance: true });
                  return send(data, member);
                }
                return sendAsOracleMember(client, impersonated, member, dsm.address, data, 2_000_000_000n);
              },
            ],
            [
              "setOwner",
              () => send(encodeFunctionData({ abi: dsm.abi, functionName: "setOwner", args: [newOwner] }), owner),
            ],
            [
              "removeGuardian(existing)",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "removeGuardian", args: [guardian, 3n] }),
                  newOwner,
                ),
            ],
            [
              "addGuardian(new)",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "addGuardian", args: [candidate1, 4n] }),
                  newOwner,
                ),
            ],
            [
              "removeGuardian(new)",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "removeGuardian", args: [candidate1, 3n] }),
                  newOwner,
                ),
            ],
            [
              "addGuardians",
              () =>
                send(
                  encodeFunctionData({
                    abi: dsm.abi,
                    functionName: "addGuardians",
                    args: [[candidate2, candidate1], 4n],
                  }),
                  newOwner,
                ),
            ],
            [
              "removeGuardian(second new)",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "removeGuardian", args: [candidate2, 4n] }),
                  newOwner,
                ),
            ],
            [
              "setPauseIntentValidityPeriodBlocks",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "setPauseIntentValidityPeriodBlocks", args: [42n] }),
                  newOwner,
                ),
            ],
            [
              "setGuardianQuorum(0)",
              () => send(encodeFunctionData({ abi: dsm.abi, functionName: "setGuardianQuorum", args: [0n] }), newOwner),
            ],
            [
              "setGuardianQuorum(3)",
              () => send(encodeFunctionData({ abi: dsm.abi, functionName: "setGuardianQuorum", args: [3n] }), newOwner),
            ],
            [
              "unpauseDeposits",
              () => send(encodeFunctionData({ abi: dsm.abi, functionName: "unpauseDeposits", args: [] }), newOwner),
            ],
            [
              "setMaxOperatorsPerUnvetting(42)",
              () =>
                send(
                  encodeFunctionData({ abi: dsm.abi, functionName: "setMaxOperatorsPerUnvetting", args: [42n] }),
                  newOwner,
                ),
            ],
          ];
          for (const [name, action] of actions) {
            // Automine stamps blocks from the wall clock, so each action's block is pinned
            await client.send("evm_setNextBlockTimestamp", [Number(await client.getChainTime()) + 1]);
            await action();
            frames[name] = await snapshot();
          }
          return frames;
        } finally {
          await impersonated.stopAll(client);
        }
      }

      await testUpgrade({
        beforeExecution: async () => {
          negative = await getLocalAccount(client, 0);
          newOwner = await getLocalAccount(client, 7);
          const guardians = await client.read(dsm, "getGuardians");
          assert.isAtLeast(guardians.length, 2, "two initial guardians");
          guardian = guardians[1];
          targetBlock = (await client.viemClient.getBlockNumber({ cacheTime: 0 })) + 1000n;
          targetTime = BigInt(await client.getChainTime()) + 14n * 24n * 60n * 60n;
          before = await client.withSnapshot(run);
        },
        afterExecution: async () => {
          const after = await run();
          assert.deepEqual(Object.keys(after), Object.keys(before), "DSM frame names");
          for (const name of Object.keys(before)) {
            const scope = `dsm/${caseName}/${name}`;
            const oldFrame = { ...before[name] };
            const newFrame = { ...after[name] };
            assertWithinTolerance(context, scope, "chain_time", oldFrame, newFrame, 1n);
            assertSnapshot(context, scope, oldFrame, newFrame);
          }
        },
      });
    });
  }
});
