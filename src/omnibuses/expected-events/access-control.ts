import { Address } from "abitype";
import { keccak256, toHex } from "viem";

import { AccessControl_ABI } from "../../../abi/AccessControl.abi";
import { ACL_ABI } from "../../../abi/ACL.abi";
import { HexStrPrefixed } from "../../common/bytes";
import { Contract } from "../../contracts";
import { AclParam, aclParamsHash } from "../acl-permission-params";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

/** Role name or its hash. */
export function roleDigest(role: string | HexStrPrefixed): HexStrPrefixed {
  return role.startsWith("0x") && role.length === 66 ? (role as HexStrPrefixed) : keccak256(toHex(role));
}

function asAccessControl(contract: Contract): Contract<typeof AccessControl_ABI> {
  return { abi: AccessControl_ABI, label: contract.label, address: contract.address };
}

function roleGranted(on: Contract, input: { role: string; to: Address }): OmnibusCallEvent[] {
  return [event(asAccessControl(on), "RoleGranted", [roleDigest(input.role), input.to, null])];
}

function roleRevoked(on: Contract, input: { role: string; from: Address }): OmnibusCallEvent[] {
  return [event(asAccessControl(on), "RoleRevoked", [roleDigest(input.role), input.from, null])];
}

type Acl = Contract<typeof ACL_ABI>;

interface AclPermissionInput {
  entity: Address;
  app: Address;
  role: string;
  /** Only for `grantPermissionP`; the ACL emits the hash of the encoded params. */
  params?: AclParam[];
}

function permissionGranted(acl: Acl, { entity, app, role, params }: AclPermissionInput): OmnibusCallEvent[] {
  const events = [event(acl, "SetPermission", [entity, app, roleDigest(role), true])];
  if (params && params.length > 0) {
    events.push(event(acl, "SetPermissionParams", [entity, app, roleDigest(role), aclParamsHash(params)]));
  }
  return events;
}

function permissionRevoked(acl: Acl, { entity, app, role }: Omit<AclPermissionInput, "params">): OmnibusCallEvent[] {
  return [event(acl, "SetPermission", [entity, app, roleDigest(role), false])];
}

export default { roleGranted, roleRevoked, permissionGranted, permissionRevoked };
