import { Address } from "abitype";
import { keccak256, toHex } from "viem";

import { contract, Contract } from "../../contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { AccessControl_ABI } from "../../../abi/AccessControl.abi";
import { BlueprintCtx } from "../omnibus";

interface GrantRoleInput {
  title: string;
  on: Contract;
  role: string;
  to: Address;
}

function grantRole(ctx: BlueprintCtx, input: GrantRoleInput): OmnibusDirectCall {
  const accessControl: Contract<typeof AccessControl_ABI> = {
    abi: AccessControl_ABI,
    label: input.on.label,
    address: input.on.address,
  };
  const roleDigest = keccak256(toHex(input.role));
  return ctx.directCall(input.title, {
    on: accessControl,
    fn: "grantRole",
    args: [roleDigest, input.to],
    events: [ctx.event(accessControl, "RoleGranted", [roleDigest, input.to, null])],
  });
}

interface RevokeRoleInput {
  title: string;
  on: Contract;
  role: string;
  from: Address;
}

function revokeRole(ctx: BlueprintCtx, input: RevokeRoleInput): OmnibusDirectCall {
  const accessControl: Contract<typeof AccessControl_ABI> = contract(AccessControl_ABI, input.on.address);
  const roleDigest = keccak256(toHex(input.role));

  return ctx.directCall(input.title, {
    on: accessControl,
    fn: "revokeRole",
    args: [roleDigest, input.from],
    events: [ctx.event(accessControl, "RoleRevoked", [roleDigest, input.from, null])],
  });
}

export default { grantRole, revokeRole };
