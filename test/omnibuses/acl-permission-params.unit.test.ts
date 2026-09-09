import { assert } from "chai";

import {
  AclOp,
  aclIfElse,
  aclParam,
  aclParamsHash,
  decodeAclParam,
  encodeAclParam,
  formatAclParam,
} from "../../src/omnibuses/acl-permission-params";
import { expectedEvents } from "../../src/omnibuses/expected-events";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";

const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const CONSENSYS_MANAGER = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const NODE_OPERATORS_REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const MANAGE_SIGNING_KEYS = "0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee";

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

  it("formats nodes for a human", () => {
    assert.equal(formatAclParam(aclParam(0, AclOp.EQ, 21)), "arg0 EQ 21");
    assert.equal(formatAclParam(aclIfElse(1, 2, 3)), "if [1] then [2] else [3]");
  });

  it("hashes params the way the ACL stored them for vote #201", () => {
    // SetPermissionParams emitted at mainnet block 25151537 for the Consensys manager
    assert.equal(
      aclParamsHash([aclParam(0, AclOp.EQ, 21)]),
      "0x25375cc5fa2fa956d7fe6cc76058aa8b2ee44beb73947ac0dfe863429d48be4f",
    );
  });

  it("expects SetPermissionParams only when params are given", () => {
    const { acl } = getGovernanceContracts("mainnet");
    const input = { entity: CONSENSYS_MANAGER, app: NODE_OPERATORS_REGISTRY, role: MANAGE_SIGNING_KEYS } as const;

    const plain = expectedEvents.accessControl.permissionGranted(acl, input);
    const parametrised = expectedEvents.accessControl.permissionGranted(acl, {
      ...input,
      params: [aclParam(0, AclOp.EQ, 21)],
    });

    assert.deepEqual(
      plain.map((expected) => expected.abi.name),
      ["SetPermission"],
    );
    assert.deepEqual(
      parametrised.map((expected) => expected.abi.name),
      ["SetPermission", "SetPermissionParams"],
    );
    assert.equal(parametrised[1].args[3], "0x25375cc5fa2fa956d7fe6cc76058aa8b2ee44beb73947ac0dfe863429d48be4f");
  });
});
