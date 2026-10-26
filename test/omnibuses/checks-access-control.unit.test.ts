import { rejects } from "node:assert/strict";
import { assert } from "chai";
import sinon from "sinon";
import { createPublicClient, custom, encodeAbiParameters, encodeFunctionData, walletActions } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { contract } from "../../src/contracts";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import checks from "../../src/omnibuses/checks/access-control";
import { AclOp, aclIfElse, aclParam } from "../../src/omnibuses/acl-permission-params";

const ACL = "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb";
const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const MANAGER = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const ROLE = "0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee";
const acl = contract(ACL_ABI, ACL);
const input = { contracts: { acl }, entity: MANAGER, app: REGISTRY, role: ROLE } as const;

describe("Aragon permission checks", () => {
  afterEach(() => sinon.restore());

  for (const allowed of [true, false]) {
    for (const args of [undefined, [], [21n]] as const) {
      it(`checks ${allowed ? "granted" : "denied"} permission with ${String(args)} arguments`, async () => {
        const request = sinon.stub().resolves(encodeAbiParameters([{ type: "bool" }], [allowed]));
        const client = new DevRpcClient(
          "mainnet",
          createPublicClient({ transport: custom({ request }) }).extend(walletActions),
        );
        const check = allowed ? checks.checkAragonPermissionGranted : checks.checkAragonPermissionNotGranted;

        await check({ client }, { ...input, args });

        const expectedData = encodeFunctionData({
          abi: ACL_ABI,
          functionName: "hasPermission",
          args: args === undefined ? [MANAGER, REGISTRY, ROLE] : [MANAGER, REGISTRY, ROLE, args],
        });
        sinon.assert.calledOnceWithExactly(request, {
          method: "eth_call",
          params: [{ to: ACL, data: expectedData }, "latest"],
        });
      });
    }

    it(`rejects an unexpectedly ${allowed ? "granted" : "denied"} permission`, async () => {
      const request = sinon.stub().resolves(encodeAbiParameters([{ type: "bool" }], [allowed]));
      const client = new DevRpcClient(
        "mainnet",
        createPublicClient({ transport: custom({ request }) }).extend(walletActions),
      );
      const check = allowed ? checks.checkAragonPermissionNotGranted : checks.checkAragonPermissionGranted;

      await rejects(check({ client }, { ...input, args: [22n] }), /Expected Aragon permission/);
    });
  }

  for (const storedLogicId of [204, 0]) {
    it(`${storedLogicId === 204 ? "accepts the same" : "rejects a different"} logic node argument ID`, async () => {
      const params = [
        aclIfElse(1, 2, 3),
        aclParam(0, AclOp.EQ, 21n),
        aclParam(1, AclOp.LTE, 1000n),
        aclParam(1, AclOp.LTE, 100n),
      ];
      const stored = [{ ...params[0], argId: storedLogicId }, ...params.slice(1)];
      const request = sinon.stub();
      request.onCall(0).resolves(encodeAbiParameters([{ type: "uint256" }], [BigInt(stored.length)]));
      stored.forEach(({ argId, op, value }, index) => {
        request
          .onCall(index + 1)
          .resolves(
            encodeAbiParameters([{ type: "uint8" }, { type: "uint8" }, { type: "uint240" }], [argId, op, value]),
          );
      });
      const client = new DevRpcClient(
        "mainnet",
        createPublicClient({ transport: custom({ request }) }).extend(walletActions),
      );

      const result = checks.checkAragonPermissionParams({ client }, { ...input, params });
      if (storedLogicId === 204) {
        await result;
      } else {
        await rejects(result, /different params/);
      }
      assert.equal(request.callCount, stored.length + 1);
    });
  }

  it("compares every stored parameter, including an unexpected extra node", async () => {
    const request = sinon.stub();
    request.onCall(0).resolves(encodeAbiParameters([{ type: "uint256" }], [2n]));
    request
      .onCall(1)
      .resolves(encodeAbiParameters([{ type: "uint8" }, { type: "uint8" }, { type: "uint240" }], [0, 1, 21n]));
    request
      .onCall(2)
      .resolves(encodeAbiParameters([{ type: "uint8" }, { type: "uint8" }, { type: "uint240" }], [1, 1, 22n]));
    const client = new DevRpcClient(
      "mainnet",
      createPublicClient({ transport: custom({ request }) }).extend(walletActions),
    );

    await rejects(
      checks.checkAragonPermissionParams({ client }, { ...input, params: [aclParam(0, AclOp.EQ, 21n)] }),
      /different params/,
    );
    assert.equal(request.callCount, 3);
  });
});
