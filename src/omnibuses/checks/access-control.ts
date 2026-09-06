import { AccessControl_ABI } from "../../../abi/AccessControl.abi";
import { ACL_ABI } from "../../../abi/ACL.abi";
import { assert } from "../../common/assert";
import { Contract } from "../../contracts";
import { AclParam, formatAclParam } from "../acl-permission-params";
import { CheckContext } from "./checks";
import { Address, Hex } from "viem";

interface AccessControlContracts {
  accessControl: Contract<typeof AccessControl_ABI>;
}

interface AclContracts {
  acl: Contract<typeof ACL_ABI>;
}

interface CheckOzRoleInput {
  contracts: AccessControlContracts;
  role: Hex;
  account: Address;
}

interface CheckAragonPermissionInput {
  contracts: AclContracts;
  entity: Address;
  app: Address;
  role: Hex;
  args?: readonly bigint[];
}

async function checkOzRoleGranted(
  { client }: CheckContext,
  { contracts, role, account }: CheckOzRoleInput,
): Promise<void> {
  const hasRole = await client.read(contracts.accessControl, "hasRole", [role, account]);
  assert.isTrue(hasRole, `Expected OZ role ${role} to be granted for ${account} on ${contracts.accessControl.address}`);
}

async function checkOzRoleNotGranted(
  { client }: CheckContext,
  { contracts, role, account }: CheckOzRoleInput,
): Promise<void> {
  const hasRole = await client.read(contracts.accessControl, "hasRole", [role, account]);
  assert.isFalse(
    hasRole,
    `Expected OZ role ${role} to be revoked for ${account} on ${contracts.accessControl.address}`,
  );
}

async function checkAragonPermissionGranted(
  { client }: CheckContext,
  { contracts, entity, app, role, args }: CheckAragonPermissionInput,
): Promise<void> {
  const hasPermission =
    args === undefined
      ? await client.read(contracts.acl, "hasPermission", [entity, app, role])
      : await client.read(contracts.acl, "hasPermission", [entity, app, role, args]);
  assert.isTrue(
    hasPermission,
    `Expected Aragon permission ${role} to be granted for ${entity} on app ${app} via ACL ${contracts.acl.address}`,
  );
}

async function checkAragonPermissionNotGranted(
  { client }: CheckContext,
  { contracts, entity, app, role, args }: CheckAragonPermissionInput,
): Promise<void> {
  const hasPermission =
    args === undefined
      ? await client.read(contracts.acl, "hasPermission", [entity, app, role])
      : await client.read(contracts.acl, "hasPermission", [entity, app, role, args]);
  assert.isFalse(
    hasPermission,
    `Expected Aragon permission ${role} to be revoked for ${entity} on app ${app} via ACL ${contracts.acl.address}`,
  );
}

/** Reads the stored params back and compares them node by node with what the vote meant to grant. */
async function checkAragonPermissionParams(
  { client }: CheckContext,
  { contracts, entity, app, role, params }: CheckAragonPermissionInput & { params: AclParam[] },
): Promise<void> {
  const length = await client.read(contracts.acl, "getPermissionParamsLength", [entity, app, role]);
  const stored: AclParam[] = [];
  for (let index = 0n; index < length; index++) {
    const [argId, op, value] = await client.read(contracts.acl, "getPermissionParam", [entity, app, role, index]);
    stored.push({ argId, op, value });
  }
  assert.deepEqual(
    stored.map(formatAclParam),
    params.map(formatAclParam),
    `Permission ${role} of ${entity} on app ${app} has different params`,
  );
}

export default {
  checkAragonPermissionParams,
  checkOzRoleGranted,
  checkOzRoleNotGranted,
  checkAragonPermissionGranted,
  checkAragonPermissionNotGranted,
};
