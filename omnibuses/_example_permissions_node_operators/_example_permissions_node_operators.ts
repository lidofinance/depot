import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { parseAbi, parseEther } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { StakingRouter_ABI } from "../../abi/StakingRouter.abi";
import { contract, Contract } from "../../src/contracts";
import { DevRpcClient } from "../../src/network";
import { aclParam, AclOp, expectedEvents as ev, Omnibus } from "../../src/omnibuses";

const constantsAbi = parseAbi([
  "function ACL() view returns (address)",
  "function AGENT() view returns (address)",
  "function NODE_OPERATORS_REGISTRY() view returns (address)",
  "function STAKING_ROUTER() view returns (address)",
  "function KEYS_MANAGER() view returns (address)",
  "function MANAGE_SIGNING_KEYS() view returns (bytes32)",
  "function NODE_OPERATOR_ID() view returns (uint256)",
  "function STAKING_MODULE_ID() view returns (uint256)",
  "function NEW_REWARD_ADDRESS() view returns (address)",
  "function NEW_NAME() view returns (string)",
  "function TARGET_LIMIT_MODE() view returns (uint256)",
  "function TARGET_VALIDATORS_COUNT() view returns (uint256)",
  "function ITEM_TITLE() view returns (string)",
]);

async function readSettings(client: DevRpcClient, omnibus: Contract) {
  const constants = contract(constantsAbi, omnibus.address);
  const [
    acl,
    agent,
    registry,
    router,
    keysManager,
    role,
    operatorId,
    moduleId,
    rewardAddress,
    name,
    targetLimitMode,
    targetValidatorsCount,
    title,
  ] = await Promise.all([
    client.read(constants, "ACL"),
    client.read(constants, "AGENT"),
    client.read(constants, "NODE_OPERATORS_REGISTRY"),
    client.read(constants, "STAKING_ROUTER"),
    client.read(constants, "KEYS_MANAGER"),
    client.read(constants, "MANAGE_SIGNING_KEYS"),
    client.read(constants, "NODE_OPERATOR_ID"),
    client.read(constants, "STAKING_MODULE_ID"),
    client.read(constants, "NEW_REWARD_ADDRESS"),
    client.read(constants, "NEW_NAME"),
    client.read(constants, "TARGET_LIMIT_MODE"),
    client.read(constants, "TARGET_VALIDATORS_COUNT"),
    client.read(constants, "ITEM_TITLE"),
  ]);
  return {
    acl: contract(ACL_ABI, acl),
    registry: contract(NodeOperatorsRegistry_ABI, registry),
    router: contract(StakingRouter_ABI, router),
    agent,
    keysManager,
    role,
    operatorId,
    moduleId,
    rewardAddress,
    name,
    targetLimitMode,
    targetValidatorsCount,
    title,
  };
}

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const settings = await readSettings(client, deployment.omnibus);
    const permission = {
      contracts: { acl: settings.acl },
      entity: settings.keysManager,
      app: settings.registry.address,
      role: settings.role,
    };
    assert.equal(
      await client.read(settings.acl, "getPermissionManager", [settings.registry.address, settings.role]),
      settings.agent,
    );
    assert.equal(
      (await client.read(settings.router, "getStakingModule", [settings.moduleId])).stakingModuleAddress,
      settings.registry.address,
    );
    await checks.accessControl.checkAragonPermissionParams({
      ...permission,
      params: [aclParam(0, AclOp.EQ, settings.operatorId)],
    });
    await checks.accessControl.checkAragonPermissionGranted({ ...permission, args: [settings.operatorId] });
    await checks.accessControl.checkAragonPermissionNotGranted({
      ...permission,
      args: [settings.operatorId + 1n],
    });
    await checks.stakingRouter.checkNodeOperator({
      stakingModule: settings.registry,
      operatorId: settings.operatorId,
      active: true,
    });

    const { voteEvents, voteId } = await passOmnibus();
    voteEvents.item(settings.title);
    assert.isTrue(await client.read(deployment.omnibus, "isValidVoteScript", [voteId]));
  },

  testProposal: async ({ client, checks, passProposals, deployment }) => {
    const settings = await readSettings(client, deployment.omnibus);
    const permission = { entity: settings.keysManager, app: settings.registry.address, role: settings.role };
    const [nonce, before, activeCount] = await Promise.all([
      client.read(settings.registry, "getNonce"),
      client.read(settings.registry, "getNodeOperator", [settings.operatorId, true]),
      client.read(settings.registry, "getActiveNodeOperatorsCount"),
    ]);
    assert.notEqual(before[1], settings.name);
    assert.notEqual(before[2], settings.rewardAddress);
    const [proposal] = (await passProposals()).proposalEvents;
    proposal.call(0, ev.accessControl.permissionRevoked(settings.acl, permission));
    proposal.call(
      1,
      ev.accessControl.permissionGranted(settings.acl, {
        ...permission,
        params: [aclParam(0, AclOp.EQ, settings.operatorId)],
      }),
    );
    proposal.call(
      2,
      ev.nodeOperators.nameSet(settings.registry, { nodeOperatorId: settings.operatorId, name: settings.name }),
    );
    proposal.call(
      3,
      ev.nodeOperators.rewardAddressSet(settings.registry, {
        nodeOperatorId: settings.operatorId,
        rewardAddress: settings.rewardAddress,
      }),
    );
    proposal.call(
      4,
      ev.nodeOperators.targetValidatorsCountChanged(settings.registry, {
        nodeOperatorId: settings.operatorId,
        targetLimitMode: settings.targetLimitMode,
        targetValidatorsCount: settings.targetValidatorsCount,
        nonce: nonce + 1n,
      }),
    );
    proposal.call(
      5,
      ev.nodeOperators.activeSet(settings.registry, {
        nodeOperatorId: settings.operatorId,
        active: false,
        nonce: nonce + 2n,
        vettedSigningKeysCount: before[3] > before[6] ? before[6] : undefined,
      }),
    );

    const permissionCheck = { ...permission, contracts: { acl: settings.acl } };
    await checks.accessControl.checkAragonPermissionParams({
      ...permissionCheck,
      params: [aclParam(0, AclOp.EQ, settings.operatorId)],
    });
    await checks.accessControl.checkAragonPermissionGranted({ ...permissionCheck, args: [settings.operatorId] });
    await checks.accessControl.checkAragonPermissionNotGranted({
      ...permissionCheck,
      args: [settings.operatorId + 1n],
    });
    await checks.stakingRouter.checkNodeOperator({
      stakingModule: settings.registry,
      operatorId: settings.operatorId,
      active: false,
      name: settings.name,
      rewardAddress: settings.rewardAddress,
    });
    await checks.stakingRouter.checkNodeOperatorTargetValidatorsCount({
      stakingModule: settings.registry,
      operatorId: settings.operatorId,
      targetLimitMode: settings.targetLimitMode,
      targetValidatorsCount: settings.targetValidatorsCount,
    });
    assert.equal(await client.read(settings.registry, "getNonce"), nonce + 2n);
    assert.equal(await client.read(settings.registry, "getActiveNodeOperatorsCount"), activeCount - 1n);
    assert.equal((await client.read(settings.registry, "getNodeOperator", [settings.operatorId, true]))[3], before[6]);

    await client.withSnapshot(async () => {
      await client.impersonate(settings.keysManager, parseEther("1"));
      try {
        await rejects(
          client.write(settings.registry, "removeSigningKeys", [settings.operatorId + 1n, 0n, 1n], {
            from: settings.keysManager,
          }),
          /APP_AUTH_FAILED/,
        );
        const current = await client.read(settings.registry, "getNodeOperator", [settings.operatorId, true]);
        assert.isTrue(current[5] > current[6], "The operator needs an unused key to exercise its permission");
        await client.write(settings.registry, "removeSigningKeys", [settings.operatorId, current[6], 1n], {
          from: settings.keysManager,
        });
        assert.equal(
          (await client.read(settings.registry, "getNodeOperator", [settings.operatorId, true]))[5],
          current[5] - 1n,
        );
      } finally {
        await client.stopImpersonating(settings.keysManager);
      }
    });
  },
});
