import { AccessControl_ABI } from "../../../abi/AccessControl.abi";
import { ACL_ABI } from "../../../abi/ACL.abi";
import { assert } from "../../common/assert";
import { Contract } from "../../contracts";
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
  { contracts, entity, app, role }: CheckAragonPermissionInput,
): Promise<void> {
  const hasPermission = await client.read(contracts.acl, "hasPermission", [entity, app, role]);
  assert.isTrue(
    hasPermission,
    `Expected Aragon permission ${role} to be granted for ${entity} on app ${app} via ACL ${contracts.acl.address}`,
  );
}

async function checkAragonPermissionNotGranted(
  { client }: CheckContext,
  { contracts, entity, app, role }: CheckAragonPermissionInput,
): Promise<void> {
  const hasPermission = await client.read(contracts.acl, "hasPermission", [entity, app, role]);
  assert.isFalse(
    hasPermission,
    `Expected Aragon permission ${role} to be revoked for ${entity} on app ${app} via ACL ${contracts.acl.address}`,
  );
}

export default {
  checkOzRoleGranted,
  checkOzRoleNotGranted,
  checkAragonPermissionGranted,
  checkAragonPermissionNotGranted,
};
