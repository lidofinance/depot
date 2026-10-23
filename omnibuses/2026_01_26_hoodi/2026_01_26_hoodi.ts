import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { parseAbi, parseEther } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { Kernel_ABI } from "../../abi/Kernel.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { contract } from "../../src/contracts";
import { aclParam, AclOp, expectedEvents as ev, Omnibus } from "../../src/omnibuses";

const constantsAbi = parseAbi([
  "function VOTING() view returns (address)",
  "function ACL() view returns (address)",
  "function NODE_OPERATORS_REGISTRY() view returns (address)",
  "function KEYS_MANAGER() view returns (address)",
  "function MANAGE_SIGNING_KEYS() view returns (bytes32)",
  "function NODE_OPERATOR_ID() view returns (uint256)",
  "function ITEM_TITLE() view returns (string)",
]);

export default Omnibus.create({
  network: "hoodi",

  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const constants = contract(constantsAbi, deployment.omnibus.address);
    const [voting, aclAddress, registryAddress, keysManager, role, operatorId, title] = await Promise.all([
      client.read(constants, "VOTING"),
      client.read(constants, "ACL"),
      client.read(constants, "NODE_OPERATORS_REGISTRY"),
      client.read(constants, "KEYS_MANAGER"),
      client.read(constants, "MANAGE_SIGNING_KEYS"),
      client.read(constants, "NODE_OPERATOR_ID"),
      client.read(constants, "ITEM_TITLE"),
    ]);
    const acl = contract(ACL_ABI, aclAddress);
    const registry = contract(NodeOperatorsRegistry_ABI, registryAddress);
    const permission = { entity: keysManager, app: registry.address, role };
    const permissionCheck = { ...permission, contracts: { acl } };
    const params = [aclParam(0, AclOp.EQ, operatorId)];
    const kernel = contract(Kernel_ABI, await client.read(registry, "kernel"));
    const [unrelatedCaller] = await client.getAccounts();

    assert.equal(await client.read(registry, "MANAGE_SIGNING_KEYS"), role);
    assert.equal(await client.read(acl, "kernel"), kernel.address);
    assert.equal(await client.read(kernel, "acl"), acl.address);
    assert.equal(await client.read(acl, "getPermissionManager", [registry.address, role]), voting);
    assert.notEqual(unrelatedCaller, keysManager);
    await checks.accessControl.checkAragonPermissionParams({ ...permissionCheck, params: [] });
    for (const id of [operatorId - 1n, operatorId, operatorId + 1n]) {
      await checks.accessControl.checkAragonPermissionNotGranted({ ...permissionCheck, args: [id] });
    }
    await checks.accessControl.checkAragonPermissionNotGranted({
      ...permissionCheck,
      entity: unrelatedCaller,
      args: [operatorId],
    });

    const before = await client.read(registry, "getNodeOperator", [operatorId, true]);
    assert.isTrue(before[5] > before[6], "The operator needs an unused key to exercise its permission");
    await client.withSnapshot(async () => {
      await client.impersonate(keysManager, parseEther("1"));
      try {
        await rejects(
          client.write(registry, "removeSigningKeys", [operatorId, before[6], 1n], { from: keysManager }),
          /APP_AUTH_FAILED/,
        );
      } finally {
        await client.stopImpersonating(keysManager);
      }
    });

    const { voteEvents } = await passOmnibus();
    voteEvents.item(title, ev.accessControl.permissionGranted(acl, { ...permission, params }));

    await checks.accessControl.checkAragonPermissionParams({ ...permissionCheck, params });
    await checks.accessControl.checkAragonPermissionGranted({ ...permissionCheck, args: [operatorId] });
    for (const id of [operatorId - 1n, operatorId + 1n]) {
      await checks.accessControl.checkAragonPermissionNotGranted({ ...permissionCheck, args: [id] });
    }
    await checks.accessControl.checkAragonPermissionNotGranted({
      ...permissionCheck,
      entity: unrelatedCaller,
      args: [operatorId],
    });

    await client.withSnapshot(async () => {
      await client.impersonate(keysManager, parseEther("1"));
      try {
        await rejects(
          client.write(registry, "removeSigningKeys", [operatorId + 1n, 0n, 1n], { from: keysManager }),
          /APP_AUTH_FAILED/,
        );
        await rejects(
          client.write(registry, "removeSigningKeys", [operatorId, before[6], 1n], { from: unrelatedCaller }),
          /APP_AUTH_FAILED/,
        );
        await client.write(registry, "removeSigningKeys", [operatorId, before[6], 1n], { from: keysManager });
        assert.equal((await client.read(registry, "getNodeOperator", [operatorId, true]))[5], before[5] - 1n);
      } finally {
        await client.stopImpersonating(keysManager);
      }
    });
  },
});
