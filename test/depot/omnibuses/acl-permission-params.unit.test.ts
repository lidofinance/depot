import { assert } from "chai";

import {
  AclOp,
  aclIfElse,
  aclParam,
  aclParamsHash,
  decodeAclParam,
  encodeAclParam,
} from "@/src/omnibuses/acl-permission-params";

const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

describe("ACL permission params", () => {
  it("encodes the nodes the way scripts did for votes #201 and #195", () => {
    assert.equal(encodeAclParam(aclParam(0, AclOp.EQ, 21)), (1n << 240n) + 21n);
    assert.equal(encodeAclParam(aclParam(0, AclOp.EQ, STETH)), (1n << 240n) + BigInt(STETH));
    assert.equal(encodeAclParam(aclParam(2, AclOp.LTE, 1000n * 10n ** 18n)), (2n << 248n) + (6n << 240n) + 10n ** 21n);
    assert.equal(
      encodeAclParam(aclIfElse(1, 2, 3)),
      0xcc0c000000000000000000000000000000000000000000030000000200000001n,
    );
  });

  it("decodes what it encodes", () => {
    const params = [aclIfElse(1, 2, 3), aclParam(0, AclOp.EQ, STETH), aclParam(2, AclOp.LTE, 1000n)];

    assert.deepEqual(params.map(encodeAclParam).map(decodeAclParam), params);
  });

  it("hashes params the way the ACL stored them for vote #201", () => {
    // SetPermissionParams emitted at mainnet block 25151537 for the Consensys manager
    assert.equal(
      aclParamsHash([aclParam(0, AclOp.EQ, 21)]),
      "0x25375cc5fa2fa956d7fe6cc76058aa8b2ee44beb73947ac0dfe863429d48be4f",
    );
  });
});
