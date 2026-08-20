import { Address } from "abitype";
import { keccak256, toHex } from "viem";

import { AccessControl_ABI } from "../../../abi/AccessControl.abi";
import { HexStrPrefixed } from "../../common/bytes";
import { Contract } from "../../contracts";
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

export default { roleGranted, roleRevoked };
