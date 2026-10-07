import { assert } from "chai";
import { Address, encodeAbiParameters, Hex, Log, pad, toEventSelector, toHex } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { AccessControl_ABI } from "../../abi/AccessControl.abi";
import { contract } from "../../src/contracts";
import { aclParam, AclOp } from "../../src/omnibuses/acl-permission-params";
import events from "../../src/omnibuses/expected-events/access-control";
import { LogCollector } from "../../src/omnibuses/log-collector";

const ACL = "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb";
const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const MANAGER = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const ROLE = "0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee";
const PARAMS_HASH = "0x25375cc5fa2fa956d7fe6cc76058aa8b2ee44beb73947ac0dfe863429d48be4f";
const acl = contract(ACL_ABI, ACL);
const input = { entity: MANAGER, app: REGISTRY, role: ROLE } as const;

function log(address: Address, signature: string, data: Hex, indexed: Hex[]): Log {
  return {
    address,
    topics: [toEventSelector(signature), ...indexed],
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    logIndex: null,
    removed: false,
  };
}

function permissionLog(allowed: boolean): Log {
  return log(ACL, "SetPermission(address,address,bytes32,bool)", encodeAbiParameters([{ type: "bool" }], [allowed]), [
    pad(MANAGER),
    pad(REGISTRY),
    ROLE,
  ]);
}

function managerLog(): Log {
  return log(ACL, "ChangePermissionManager(address,bytes32,address)", "0x", [pad(REGISTRY), ROLE, pad(AGENT)]);
}

function paramsLog(): Log {
  return log(ACL, "SetPermissionParams(address,address,bytes32,bytes32)", PARAMS_HASH, [
    pad(MANAGER),
    pad(REGISTRY),
    ROLE,
  ]);
}

describe("permission event helpers", () => {
  it("matches creation and its manager in order", () => {
    const collector = new LogCollector([permissionLog(true), managerLog()]);
    collector.assertEvents(events.permissionCreated(acl, { ...input, manager: AGENT }));
    collector.assertNothingLeft();
  });

  it("matches manager changes independently", () => {
    const collector = new LogCollector([managerLog()]);
    collector.assertEvents(events.permissionManagerSet(acl, { ...input, manager: AGENT }));
    collector.assertNothingLeft();
  });

  it("matches a revoke and an unparameterized grant", () => {
    const collector = new LogCollector([permissionLog(false), permissionLog(true)]);
    collector.assertEvents(events.permissionRevoked(acl, input));
    collector.assertEvents(events.permissionGranted(acl, { ...input, params: [] }));
    collector.assertNothingLeft();
  });

  it("matches the exact hash of parameterized permissions", () => {
    const collector = new LogCollector([permissionLog(true), paramsLog()]);
    collector.assertEvents(events.permissionGranted(acl, { ...input, params: [aclParam(0, AclOp.EQ, 21n)] }));
    collector.assertNothingLeft();
  });

  for (const mismatch of [
    { entity: AGENT },
    { app: AGENT },
    { role: toHex(1n, { size: 32 }) },
    { params: [aclParam(0, AclOp.EQ, 22n)] },
  ] satisfies Partial<Parameters<typeof events.permissionGranted>[1]>[]) {
    it(`rejects incorrect ${Object.keys(mismatch)[0]}`, () => {
      const collector = new LogCollector([permissionLog(true), paramsLog()]);
      assert.throws(
        () =>
          collector.assertEvents(
            events.permissionGranted(acl, { ...input, params: [aclParam(0, AclOp.EQ, 21n)], ...mismatch }),
          ),
        /args mismatch/,
      );
    });
  }

  it("rejects reordered events and a wrong emitter", () => {
    const expected = events.permissionCreated(acl, { ...input, manager: AGENT });
    assert.throws(() => new LogCollector([managerLog(), permissionLog(true)]).assertEvents(expected));
    assert.throws(
      () => new LogCollector([{ ...permissionLog(true), address: AGENT }, managerLog()]).assertEvents(expected),
      /Unexpected emitter/,
    );
  });

  it("does not consume an undeclared permission grant", () => {
    const collector = new LogCollector([permissionLog(true), permissionLog(true)]);
    collector.assertEvents(events.permissionGranted(acl, input));
    assert.throws(() => collector.assertNothingLeft(), /Unchecked log items left/);
  });

  for (const granted of [true, false]) {
    it(`checks the sender of an OZ role ${granted ? "grant" : "revoke"}`, () => {
      const on = contract(AccessControl_ABI, REGISTRY);
      const roleLog = log(REGISTRY, `${granted ? "RoleGranted" : "RoleRevoked"}(bytes32,address,address)`, "0x", [
        ROLE,
        pad(MANAGER),
        pad(AGENT),
      ]);
      const expected = granted
        ? events.roleGranted(on, { role: ROLE, to: MANAGER, sender: AGENT })
        : events.roleRevoked(on, { role: ROLE, from: MANAGER, sender: AGENT });
      const collector = new LogCollector([roleLog]);
      collector.assertEvents(expected);
      collector.assertNothingLeft();
      assert.throws(
        () =>
          new LogCollector([
            { ...roleLog, topics: [roleLog.topics[0]!, ROLE, pad(MANAGER), pad(MANAGER)] },
          ]).assertEvents(expected),
        /args mismatch/,
      );
    });
  }
});
