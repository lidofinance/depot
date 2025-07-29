import { Address } from "abitype";
import { keccak256, toHex } from "viem";

import { Contract } from "../../contracts";
import { BlueprintCtx } from "../tools/create-omnibus";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { AccessControl_ABI } from "../../../abi/AccessControl.abi";

interface GrantRoleInput {
  title: string;
  role: string;
  on: Contract;
  to: Address;
}

interface RevokeRoleInput {
  title: string;
  role: string;
  on: Contract;
  from: Address;
}

function grantRole(ctx: BlueprintCtx, input: GrantRoleInput): OmnibusDirectCall {
  const accessControl: Contract<typeof AccessControl_ABI> = {
    abi: AccessControl_ABI,
    label: input.on.label,
    address: input.on.address,
  };
  const roleDigest = keccak256(toHex(input.role));
  return ctx.call(accessControl, "grantRole", [roleDigest, input.to], {
    title: input.title,
    events: [
      ctx.event(accessControl, "RoleGranted", [roleDigest, input.to, null], {
        isOptional: false,
      }),
    ],
  });
}

function revokeRole(ctx: BlueprintCtx, input: RevokeRoleInput): OmnibusDirectCall {
  const accessControl: Contract<typeof AccessControl_ABI> = {
    abi: AccessControl_ABI,
    label: input.on.label,
    address: input.on.address,
  };
  const roleDigest = keccak256(toHex(input.role));
  return ctx.call(accessControl, "revokeRole", [roleDigest, input.from], {
    title: input.title,
    events: [
      ctx.event(accessControl, "RoleRevoked", [roleDigest, input.from, null], {
        isOptional: false,
      }),
    ],
  });
}

export default { grantRole, revokeRole };
