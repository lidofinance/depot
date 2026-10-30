import { assert } from "chai";
import { randomBytes, randomInt } from "node:crypto";
import { encodeFunctionData, keccak256, parseEther, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { Lido_ABI } from "@/abi/Lido.abi";
import { NodeOperatorsRegistry_ABI } from "@/abi/NodeOperatorsRegistry.abi";
import { contract } from "@/src/contracts";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import {
  assertSnapshot,
  getLocalAccount,
  getSnapshotContext,
  hasExpectedSnapshotChange,
} from "@/test/protocol/helpers/snapshot";

const configurations = {
  mainnet: {
    registry: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    dsm: "0x39BB5d491e98A44D1bfe8047A737a81E296a63E0",
  },
  hoodi: {
    registry: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    dsm: "0x8E63F0aF403ffd3Cbd5dB18b4ee632314ab49B51",
  },
} as const;

interface Frame {
  compared: Record<string, unknown>;
  operators: readonly (readonly [boolean, string, `0x${string}`, bigint, bigint, bigint, bigint])[];
  rewards: readonly [readonly `0x${string}`[], readonly bigint[], readonly boolean[]];
  activeCount: bigint;
}

describe("NodeOperatorsRegistry upgrade snapshots", function () {
  it("preserves operator creation, key management, submit and activity transitions", async function () {
    const context = getSnapshotContext(this);
    const { client, testUpgrade } = context;
    const network = client.getNetworkName();
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Unsupported snapshot network ${network}`);
    }
    const expected = configurations[network];
    const registry = contract(NodeOperatorsRegistry_ABI, expected.registry);
    const lido = contract(Lido_ABI, expected.lido);
    const { acl } = getGovernanceContracts(network);
    const staker = await getLocalAccount(client, 0);
    const reward = await getLocalAccount(client, 3);
    const publicKeys: Hex = `0x${randomBytes(10 * 48).toString("hex")}`;
    const signatures: Hex = `0x${randomBytes(10 * 96).toString("hex")}`;
    const sampledIndices = new Map<string, number[]>();
    let operatorId: bigint;
    let before: Record<string, Frame>;

    async function snapshot(): Promise<Frame> {
      const count = await client.read(registry, "getNodeOperatorsCount");
      const activeCount = await client.read(registry, "getActiveNodeOperatorsCount");
      const compared: Record<string, unknown> = {
        node_operators_count: count,
        active_node_operators_count: activeCount,
      };
      const operators: Frame["operators"][number][] = [];
      for (let id = 0n; id < count; id++) {
        const operator = await client.read(registry, "getNodeOperator", [id, true]);
        operators.push(operator);
        const [active, name, rewardAddress, , exited, added, deposited] = operator;
        compared[`operator/${id}/active`] = active;
        compared[`operator/${id}/name`] = name;
        compared[`operator/${id}/rewardAddress`] = rewardAddress;
        compared[`operator/${id}/totalDepositedValidators`] = deposited;
        compared[`operator/${id}/totalExitedValidators`] = exited;
        compared[`operator/${id}/totalAddedValidators`] = added;
        compared[`total_signing_keys_count/${id}`] = await client.read(registry, "getTotalSigningKeyCount", [id]);
        compared[`unused_signing_keys_count/${id}`] = await client.read(registry, "getUnusedSigningKeyCount", [id]);
        const sampleKey = `${id}/${added}`;
        let indices = sampledIndices.get(sampleKey);
        if (!indices) {
          const selected = new Set<number>();
          while (selected.size < Math.min(10, Number(added))) {
            selected.add(randomInt(Number(added)));
          }
          indices = [...selected];
          sampledIndices.set(sampleKey, indices);
        }
        for (const index of indices) {
          compared[`signing_key/${id}/${index}`] = await client.read(registry, "getSigningKey", [id, BigInt(index)]);
        }
      }
      return {
        compared,
        operators,
        rewards: await client.read(registry, "getRewardsDistribution", [parseEther("1")]),
        activeCount,
      };
    }

    async function send(to: Address, data: Hex, sender: Address): Promise<void> {
      const hash = await client.viemClient.sendTransaction({
        account: sender,
        to,
        data,
        chain: client.viemClient.chain,
        gasPrice: 2_000_000_000n,
      });
      assert.equal(
        (await client.viemClient.waitForTransactionReceipt({ hash })).status,
        "success",
        "NOR scenario transaction",
      );
    }

    async function run(): Promise<Record<string, Frame>> {
      const impersonated = new ImpersonatedAccounts();
      try {
        await impersonated.impersonate(client, expected.agent, { preserveBalance: true });
        await impersonated.impersonate(client, reward, { preserveBalance: true });
        const frames: Record<string, Frame> = { root: await snapshot() };
        const actions: readonly [string, () => Promise<unknown>][] = [
          [
            "add_node_operator",
            () =>
              send(
                registry.address,
                encodeFunctionData({
                  abi: registry.abi,
                  functionName: "addNodeOperator",
                  args: ["new_node_operator", reward],
                }),
                expected.agent,
              ),
          ],
          [
            "add_signing_keys_operator_bh",
            () =>
              send(
                registry.address,
                encodeFunctionData({
                  abi: registry.abi,
                  functionName: "addSigningKeysOperatorBH",
                  args: [operatorId, 10n, publicKeys, signatures],
                }),
                reward,
              ),
          ],
          [
            "set_staking_limit",
            () =>
              send(
                registry.address,
                encodeFunctionData({
                  abi: registry.abi,
                  functionName: "setNodeOperatorStakingLimit",
                  args: [operatorId, 5n],
                }),
                expected.agent,
              ),
          ],
          [
            "submit",
            async () => {
              const hash = await client.viemClient.writeContract({
                abi: Lido_ABI,
                address: lido.address,
                functionName: "submit",
                args: [zeroAddress],
                account: staker,
                chain: client.viemClient.chain,
                value: parseEther("256"),
                gasPrice: 2_000_000_000n,
              });
              assert.equal(
                (await client.viemClient.waitForTransactionReceipt({ hash })).status,
                "success",
                "NOR scenario submit",
              );
            },
          ],
          [
            "remove_signing_keys",
            () =>
              send(
                registry.address,
                encodeFunctionData({
                  abi: registry.abi,
                  functionName: "removeSigningKeys",
                  args: [operatorId, 5n, 1n],
                }),
                reward,
              ),
          ],
          [
            "deactivate_node_operator",
            () =>
              send(
                registry.address,
                encodeFunctionData({ abi: registry.abi, functionName: "deactivateNodeOperator", args: [operatorId] }),
                expected.agent,
              ),
          ],
          [
            "activate_node_operator",
            () =>
              send(
                registry.address,
                encodeFunctionData({ abi: registry.abi, functionName: "activateNodeOperator", args: [operatorId] }),
                expected.agent,
              ),
          ],
        ];
        for (const [name, action] of actions) {
          await action();
          frames[`after_${name}`] = await snapshot();
        }
        return frames;
      } finally {
        await impersonated.stopAll(client);
      }
    }

    await testUpgrade({
      beforeExecution: async () => {
        operatorId = await client.read(registry, "getNodeOperatorsCount");
        // EtherFunder in Scripts adds 10 ETH; the DSM is not used by the disabled deposit action.
        await client.setBalance(expected.dsm, (await client.getBalance(expected.dsm)) + parseEther("10"));
        const impersonated = new ImpersonatedAccounts();
        try {
          await impersonated.impersonate(client, expected.agent, { preserveBalance: true });
          for (const role of ["MANAGE_NODE_OPERATOR_ROLE", "SET_NODE_OPERATOR_LIMIT_ROLE"]) {
            await send(
              acl.address,
              encodeFunctionData({
                abi: acl.abi,
                functionName: "grantPermission",
                args: [expected.agent, registry.address, keccak256(stringToHex(role))],
              }),
              expected.agent,
            );
          }
        } finally {
          await impersonated.stopAll(client);
        }
        before = await client.withSnapshot(run);
      },
      afterExecution: async () => {
        const after = await run();
        assert.deepEqual(Object.keys(after), Object.keys(before), "NOR frame names");
        for (const name of Object.keys(before)) {
          const oldFrame = before[name];
          const newFrame = after[name];
          const scope = `node-operators-registry/basic/${name}`;
          for (const [id, oldOperator] of oldFrame.operators.entries()) {
            const newOperator = newFrame.operators[id];
            if (oldOperator[0]) {
              oldFrame.compared[`operator/${id}/totalVettedValidators`] = oldOperator[3];
              newFrame.compared[`operator/${id}/totalVettedValidators`] = newOperator[3];
            } else {
              assert.equal(newOperator[3], newOperator[6], `${scope}: inactive operator ${id} vetted equals deposited`);
            }
          }
          for (let index = 0; index < Number(newFrame.activeCount); index++) {
            oldFrame.compared[`rewards/recipient/${index}`] = oldFrame.rewards[0][index];
            newFrame.compared[`rewards/recipient/${index}`] = newFrame.rewards[0][index];
            const key = `rewards/shares/${index}`;
            if (hasExpectedSnapshotChange(context, `${scope}/${key}`)) {
              oldFrame.compared[key] = oldFrame.rewards[1][index];
              newFrame.compared[key] = newFrame.rewards[1][index];
            } else {
              const delta = newFrame.rewards[1][index] - oldFrame.rewards[1][index];
              assert.isTrue(delta >= -200000n && delta <= 200000n, `${scope}: reward ${index} shares epsilon`);
            }
            assert.isFalse(newFrame.rewards[2][index], `${scope}: reward ${index} is not penalized after upgrade`);
          }
          assertSnapshot(context, scope, oldFrame.compared, newFrame.compared);
        }
      },
    });
  });
});
