import { Address, encodePacked, keccak256 } from "viem";

import { HexStrPrefixed } from "../common/bytes";

/** Op numbers of the deployed ACL implementation 0x9f3b9198911054b122fdb865f8a5ac516201c339. */
export enum AclOp {
  NONE = 0,
  EQ = 1,
  NEQ = 2,
  GT = 3,
  LT = 4,
  GTE = 5,
  LTE = 6,
  RET = 7,
  NOT = 8,
  AND = 9,
  OR = 10,
  XOR = 11,
  IF_ELSE = 12,
}

export const LOGIC_OP_PARAM_ID = 204;

const UINT240_MASK = (1n << 240n) - 1n;

export interface AclParam {
  argId: number;
  op: AclOp;
  value: bigint;
}

/** Mirrors `AclPermissionsUtils.param`; addresses are accepted as values. */
export function aclParam(argId: number, op: AclOp, value: bigint | number | Address): AclParam {
  const numeric = BigInt(value);
  return { argId, op, value: numeric & UINT240_MASK };
}

export function aclIfElse(condition: number, success: number, failure: number): AclParam {
  const value = BigInt(condition) | (BigInt(success) << 32n) | (BigInt(failure) << 64n);
  return { argId: LOGIC_OP_PARAM_ID, op: AclOp.IF_ELSE, value };
}

function encodeAclParam(param: AclParam): bigint {
  return (BigInt(param.argId) << 248n) | (BigInt(param.op) << 240n) | (param.value & UINT240_MASK);
}

/** `keccak256(uint256[])` the way the ACL stores it and emits in `SetPermissionParams`. */
export function aclParamsHash(params: AclParam[]): HexStrPrefixed {
  return keccak256(encodePacked(["uint256[]"], [params.map(encodeAclParam)]));
}
