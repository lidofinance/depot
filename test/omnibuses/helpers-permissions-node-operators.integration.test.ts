import { rejects } from "node:assert/strict";
import { assert } from "chai";
import hre from "hardhat";
import { NetworkConnection } from "hardhat/types/network";
import { decodeFunctionData, encodeFunctionData, isHex, parseEther } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { Agent_ABI } from "../../abi/Agent.abi";
import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { OmnibusBase_ABI } from "../../abi/OmnibusBase.abi";
import { EvmCall, EvmScriptParser } from "../../src/aragon-votes-tools/evm-script-parser";
import { contract } from "../../src/contracts";
import { createDevRpcClient, getRpcUrl } from "../../src/network/network";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { aclParam, AclOp } from "../../src/omnibuses/acl-permission-params";
import permissionChecks from "../../src/omnibuses/checks/access-control";
import nodeOperatorChecks from "../../src/omnibuses/checks/staking-router";
import { expectedEvents as ev } from "../../src/omnibuses/expected-events";
import { LogCollector } from "../../src/omnibuses/log-collector";

const FORK_BLOCK = 25918463;
const ACL = "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb";
const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const MANAGER = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const ROLE = "0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee";
const OPERATOR_ID = 21n;
const acl = contract(ACL_ABI, ACL);
const registry = contract(NodeOperatorsRegistry_ABI, REGISTRY);
const permission = { contracts: { acl }, entity: MANAGER, app: REGISTRY, role: ROLE } as const;

describe("permissions and node operator helpers (mainnet fork integration)", function () {
  let connection: NetworkConnection | undefined;
  let client: DevRpcClient;
  let calls: EvmCall[];

  before(async function () {
    connection = await hre.network.connect({
      network: "default",
      override: { chainId: 31337, forking: { enabled: true, url: getRpcUrl("mainnet"), blockNumber: FORK_BLOCK } },
    });
    client = await createDevRpcClient("mainnet", connection.provider);
    assert.equal(await client.viemClient.getChainId(), 31337);
    const [deployer] = await client.getAccounts();
    const artifact = await hre.artifacts.readArtifact("PermissionsNodeOperatorsOmnibus");
    if (!isHex(artifact.bytecode)) {
      throw new Error("Invalid omnibus bytecode");
    }
    const address = await client.deployContract({ abi: [], bytecode: artifact.bytecode }, { from: deployer });
    const omnibus = contract(OmnibusBase_ABI, address);
    const [item] = await client.read(omnibus, "getOmnibusCalls");
    const proposal = decodeFunctionData({ abi: IGovernance_ABI, data: item.payload });
    if (proposal.functionName !== "submitProposal") {
      throw new Error("Expected a DG proposal");
    }
    calls = proposal.args[0].map((call) => {
      assert.equal(call.target, AGENT);
      const forwarded = decodeFunctionData({ abi: Agent_ABI, data: call.payload });
      if (forwarded.functionName !== "forward") {
        throw new Error("Expected an Agent forward");
      }
      const nested = EvmScriptParser.decode(forwarded.args[0]).calls;
      assert.lengthOf(nested, 1);
      return nested[0];
    });
    assert.lengthOf(calls, 6);
    assert.equal(await client.read(acl, "getPermissionManager", [REGISTRY, ROLE]), AGENT);
  });

  after(async function () {
    await connection?.close();
  });

  async function execute(call: EvmCall): Promise<LogCollector> {
    const hash = await client.viemClient.sendTransaction({
      account: AGENT,
      chain: client.viemClient.chain,
      to: call.address,
      data: call.calldata,
    });
    const receipt = await client.viemClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    return new LogCollector(receipt.logs);
  }

  it("restores the live parameterized permission byte-for-byte and enforces it on signing-key removal", async function () {
    await client.withSnapshot(async () => {
      const paramsLength = await client.read(acl, "getPermissionParamsLength", [MANAGER, REGISTRY, ROLE]);
      assert.equal(paramsLength, 1n);
      const [argId, op, value] = await client.read(acl, "getPermissionParam", [MANAGER, REGISTRY, ROLE, 0n]);
      assert.deepEqual([argId, op, value], [0, AclOp.EQ, OPERATOR_ID]);
      const encodedParams = [(BigInt(argId) << 248n) | (BigInt(op) << 240n) | value];
      assert.equal(calls[1].address.toLowerCase(), ACL.toLowerCase());
      assert.equal(
        calls[1].calldata,
        encodeFunctionData({
          abi: ACL_ABI,
          functionName: "grantPermissionP",
          args: [MANAGER, REGISTRY, ROLE, encodedParams],
        }),
      );
      await permissionChecks.checkAragonPermissionGranted({ client }, { ...permission, args: [OPERATOR_ID] });
      await permissionChecks.checkAragonPermissionNotGranted({ client }, permission);
      await permissionChecks.checkAragonPermissionNotGranted({ client }, { ...permission, args: [OPERATOR_ID + 1n] });

      await client.impersonate(AGENT, parseEther("1"));
      await client.impersonate(MANAGER, parseEther("1"));
      try {
        const revoked = await execute(calls[0]);
        revoked.assertEvents(ev.accessControl.permissionRevoked(acl, permission));
        revoked.assertNothingLeft();
        await permissionChecks.checkAragonPermissionNotGranted({ client }, { ...permission, args: [OPERATOR_ID] });
        const before = await client.read(registry, "getNodeOperator", [OPERATOR_ID, true]);
        assert.isTrue(before[5] > before[6], "The test needs an unused signing key");
        await rejects(
          client.write(registry, "removeSigningKeys", [OPERATOR_ID, before[6], 1n], { from: MANAGER }),
          /APP_AUTH_FAILED/,
        );

        const granted = await execute(calls[1]);
        granted.assertEvents(
          ev.accessControl.permissionGranted(acl, { ...permission, params: [aclParam(0, AclOp.EQ, OPERATOR_ID)] }),
        );
        granted.assertNothingLeft();
        await permissionChecks.checkAragonPermissionParams(
          { client },
          { ...permission, params: [aclParam(0, AclOp.EQ, OPERATOR_ID)] },
        );
        await permissionChecks.checkAragonPermissionGranted({ client }, { ...permission, args: [OPERATOR_ID] });
        await permissionChecks.checkAragonPermissionNotGranted({ client }, { ...permission, args: [OPERATOR_ID + 1n] });
        await rejects(
          client.write(registry, "removeSigningKeys", [OPERATOR_ID + 1n, 0n, 1n], { from: MANAGER }),
          /APP_AUTH_FAILED/,
        );
        await client.write(registry, "removeSigningKeys", [OPERATOR_ID, before[6], 1n], { from: MANAGER });
        assert.equal((await client.read(registry, "getNodeOperator", [OPERATOR_ID, true]))[5], before[5] - 1n);
      } finally {
        await client.stopImpersonating(MANAGER);
        await client.stopImpersonating(AGENT);
      }
    });
  });

  it("executes all NOR helpers against the current module and checks every domain log", async function () {
    await client.withSnapshot(async () => {
      const before = await client.read(registry, "getNodeOperator", [OPERATOR_ID, true]);
      const nonce = await client.read(registry, "getNonce");
      const activeCount = await client.read(registry, "getActiveNodeOperatorsCount");
      await client.impersonate(AGENT, parseEther("1"));
      try {
        const renamed = await execute(calls[2]);
        renamed.assertEvents(
          ev.nodeOperators.nameSet(registry, { nodeOperatorId: OPERATOR_ID, name: "Consensys (Depot test)" }),
        );
        renamed.assertNothingLeft();
        await nodeOperatorChecks.checkNodeOperator(
          { client },
          { stakingModule: registry, operatorId: OPERATOR_ID, name: "Consensys (Depot test)" },
        );
        const rewards = await execute(calls[3]);
        rewards.assertEvents(
          ev.nodeOperators.rewardAddressSet(registry, { nodeOperatorId: OPERATOR_ID, rewardAddress: AGENT }),
        );
        rewards.assertNothingLeft();
        const target = await execute(calls[4]);
        target.assertEvents(
          ev.nodeOperators.targetValidatorsCountChanged(registry, {
            nodeOperatorId: OPERATOR_ID,
            targetLimitMode: 1n,
            targetValidatorsCount: 0n,
            nonce: nonce + 1n,
          }),
        );
        target.assertNothingLeft();
        await nodeOperatorChecks.checkNodeOperatorTargetValidatorsCount(
          { client },
          { stakingModule: registry, operatorId: OPERATOR_ID, targetLimitMode: 1n, targetValidatorsCount: 0n },
        );
        const deactivated = await execute(calls[5]);
        deactivated.assertEvents(
          ev.nodeOperators.activeSet(registry, {
            nodeOperatorId: OPERATOR_ID,
            active: false,
            nonce: nonce + 2n,
            vettedSigningKeysCount: before[3] > before[6] ? before[6] : undefined,
          }),
        );
        deactivated.assertNothingLeft();
        await nodeOperatorChecks.checkNodeOperator(
          { client },
          { stakingModule: registry, operatorId: OPERATOR_ID, active: false, rewardAddress: AGENT },
        );
        assert.equal(await client.read(registry, "getActiveNodeOperatorsCount"), activeCount - 1n);
        assert.equal(await client.read(registry, "getNonce"), nonce + 2n);
        assert.equal((await client.read(registry, "getNodeOperator", [OPERATOR_ID, true]))[3], before[6]);
      } finally {
        await client.stopImpersonating(AGENT);
      }
    });
  });
});
