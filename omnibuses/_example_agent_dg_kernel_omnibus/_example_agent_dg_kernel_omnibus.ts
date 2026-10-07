import { assert } from "chai";
import hre from "hardhat";
import { rejects } from "node:assert/strict";
import { Address, parseAbi, parseEther } from "viem";

import { ACL_ABI } from "../../abi/ACL.abi";
import { Kernel_ABI } from "../../abi/Kernel.abi";
import { contract, createContracts } from "../../src/contracts";
import { runHardhatTask } from "../../src/hardhat/run-task";
import { DevRpcClient } from "../../src/network";
import { expectedEvents as ev, Omnibus } from "../../src/omnibuses";

const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const ACL = "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb";
const KERNEL = "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc";
const STRANGER = "0x0000000000000000000000000000000000000703";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const contracts = createContracts({ acl: [ACL_ABI, ACL], kernel: [Kernel_ABI, KERNEL] });
const voteAbi = parseAbi([
  "function OLD_IMPLEMENTATION() view returns (address)",
  "function NEW_IMPLEMENTATION() view returns (address)",
  "function APP_ID() view returns (bytes32)",
  "function APP_MANAGER_ROLE() view returns (bytes32)",
  "function ITEM_TITLE() view returns (string)",
]);
const appAbi = parseAbi(["function version() view returns (uint256)"]);

async function readVote(client: DevRpcClient, omnibusAddress: Address) {
  const vote = contract(voteAbi, omnibusAddress);
  const [oldImplementation, newImplementation, appId, role, title, namespace] = await Promise.all([
    client.read(vote, "OLD_IMPLEMENTATION", []),
    client.read(vote, "NEW_IMPLEMENTATION", []),
    client.read(vote, "APP_ID", []),
    client.read(vote, "APP_MANAGER_ROLE", []),
    client.read(vote, "ITEM_TITLE", []),
    client.read(contracts.kernel, "APP_BASES_NAMESPACE", []),
  ]);
  return { oldImplementation, newImplementation, appId, role, title, namespace };
}

async function checkApp(client: DevRpcClient, vote: Awaited<ReturnType<typeof readVote>>, upgraded: boolean) {
  const implementation = await client.read(contracts.kernel, "getApp", [vote.namespace, vote.appId]);
  assert.equal(
    implementation.toLowerCase(),
    (upgraded ? vote.newImplementation : vote.oldImplementation).toLowerCase(),
  );
  assert.equal(await client.read(contract(appAbi, implementation), "version", []), upgraded ? 2n : 1n);
  assert.isFalse(await client.read(contracts.acl, "hasPermission", [AGENT, KERNEL, vote.role]));
  for (const caller of [AGENT, STRANGER] as const) {
    await rejects(
      client.simulate(contracts.kernel, "setApp", [vote.namespace, vote.appId, vote.newImplementation], {
        from: caller,
      }),
      /KERNEL_AUTH_FAILED/,
    );
  }
}

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, deployment, passOmnibus }) => {
    const vote = await readVote(client, deployment.omnibus.address);
    assert.equal(await client.read(contracts.kernel, "getApp", [vote.namespace, vote.appId]), ZERO_ADDRESS);
    assert.equal(
      (await client.read(contracts.acl, "getPermissionManager", [KERNEL, vote.role])).toLowerCase(),
      AGENT.toLowerCase(),
    );
    assert.isFalse(await client.read(contracts.acl, "hasPermission", [AGENT, KERNEL, vote.role]));

    // Hardhat's scoped build emits artifacts only for its root source files.
    await runHardhatTask(hre, "build", {
      files: ["contracts/mocks/MockKernelAppImplementation.sol"],
      noTests: true,
      quiet: true,
    });
    await hre.artifacts.clearCache();

    // Fixture code lives at vote-local addresses; the deployed governance contracts remain intact.
    for (const [name, address] of [
      ["MockKernelAppImplementationV1", vote.oldImplementation],
      ["MockKernelAppImplementationV2", vote.newImplementation],
    ] as const) {
      const existing = await client.viemClient.getCode({ address });
      assert.isTrue(existing === undefined || existing === "0x", `Fixture address ${address} is occupied`);
      const artifact = await hre.artifacts.readArtifact(name);
      await client.send("hardhat_setCode", [address, artifact.deployedBytecode]);
    }

    await client.impersonate(AGENT, parseEther("1"));
    try {
      await client.write(contracts.acl, "grantPermission", [AGENT, KERNEL, vote.role], { from: AGENT });
      await client.write(contracts.kernel, "setApp", [vote.namespace, vote.appId, vote.oldImplementation], {
        from: AGENT,
      });
      await client.write(contracts.acl, "revokePermission", [AGENT, KERNEL, vote.role], { from: AGENT });
    } finally {
      await client.stopImpersonating(AGENT);
    }

    await checkApp(client, vote, false);
    const { voteEvents, voteId } = await passOmnibus();
    voteEvents.item(vote.title);
    assert.isTrue(await client.read(deployment.omnibus, "isValidVoteScript", [voteId]));
    await checkApp(client, vote, false);
  },

  testProposal: async ({ client, deployment, passProposals }) => {
    const vote = await readVote(client, deployment.omnibus.address);
    await checkApp(client, vote, false);
    const [proposal] = (await passProposals()).proposalEvents;

    proposal.call(
      0,
      ev.accessControl.permissionGranted(contracts.acl, { entity: AGENT, app: KERNEL, role: vote.role }),
    );
    proposal.call(1, [
      ev.kernel.appImplementationUpdated(contracts.kernel, {
        appId: vote.appId,
        implementation: vote.newImplementation,
      }),
      ev.accessControl.permissionRevoked(contracts.acl, { entity: AGENT, app: KERNEL, role: vote.role }),
    ]);
    await checkApp(client, vote, true);
  },
});
