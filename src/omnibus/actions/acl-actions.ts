import { id } from "ethers";
import { ContractCallFactory } from "../types";

type CreatePermissionOptions = {
  entity: Address;
  targetApp: Address;
  permission: string;
  manager: Address;
};

function createPermission({
  entity,
  targetApp,
  permission,
  manager,
}: CreatePermissionOptions): ContractCallFactory {
  return (ctx) => ({
    address: ctx.addresses.acl,
    calldata: ctx.contracts.acl.interface.encodeFunctionData("createPermission", [
      entity,
      targetApp,
      id(permission),
      manager,
    ]),
  });
}

interface RevokePermissionOptions {
  targetApp: Address;
  permission: string;
  revokeFrom: Address;
}

function revokePermission({
  targetApp,
  permission,
  revokeFrom,
}: RevokePermissionOptions): ContractCallFactory {
  return (ctx) => ({
    address: ctx.addresses.acl,
    calldata: ctx.contracts.acl.interface.encodeFunctionData("revokePermission", [
      revokeFrom,
      targetApp,
      id(permission),
    ]),
  });
}

export default {
  createPermission,
  revokePermission,
};
