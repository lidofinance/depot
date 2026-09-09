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
const UINT32_MASK = (1n << 32n) - 1n;

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

export function encodeAclParam(param: AclParam): bigint {
  return (BigInt(param.argId) << 248n) | (BigInt(param.op) << 240n) | (param.value & UINT240_MASK);
}

export function decodeAclParam(encoded: bigint): AclParam {
  return {
    argId: Number(encoded >> 248n),
    op: Number((encoded >> 240n) & 0xffn),
    value: encoded & UINT240_MASK,
  };
}

/** `keccak256(uint256[])` the way the ACL stores it and emits in `SetPermissionParams`. */
export function aclParamsHash(params: AclParam[]): HexStrPrefixed {
  return keccak256(encodePacked(["uint256[]"], [params.map(encodeAclParam)]));
}

/** Human-readable node, e.g. `arg0 EQ 21` or `if [1] then [2] else [3]`. */
export function formatAclParam(param: AclParam): string {
  if (param.op === AclOp.IF_ELSE) {
    const condition = param.value & UINT32_MASK;
    const success = (param.value >> 32n) & UINT32_MASK;
    const failure = (param.value >> 64n) & UINT32_MASK;
    return `if [${condition}] then [${success}] else [${failure}]`;
  }
  if ([AclOp.AND, AclOp.OR, AclOp.XOR, AclOp.NOT].includes(param.op)) {
    return `[${param.value & UINT32_MASK}] ${AclOp[param.op]} [${(param.value >> 32n) & UINT32_MASK}]`;
  }
  return `arg${param.argId} ${AclOp[param.op]} ${param.value}`;
}
