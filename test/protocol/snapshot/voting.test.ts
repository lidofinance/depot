import { assert } from "chai";
import hre from "hardhat";
import { encodeFunctionData, getAddress, isHex, parseAbi, type Address, type Hex } from "viem";
import { contract } from "@/src/contracts";
import { EvmScriptParser } from "@/src/aragon-votes-tools/evm-script-parser";
import { setupLdoHolder } from "@/src/aragon-votes-tools/testing";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { ImpersonatedAccounts } from "@/test/protocol/helpers/impersonation";
import {
  assertSnapshot,
  getLocalAccount,
  getSnapshotContext,
  hasExpectedSnapshotChange,
} from "@/test/protocol/helpers/snapshot";

const accounts = {
  mainnet: {
    holder: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    voters: [
      "0x3e40d73eb977dc6a537af587d48316fee66e9c8c",
      "0xb8d83908aab38a159f3da47a59d84db8e1838712",
      "0xa2dfc431297aee387c05beef507e5335e684fbcd",
    ],
  },
  hoodi: {
    holder: "0xD500a8aDB182F55741E267730dfbfb4F1944C205",
    voters: [
      "0xD500a8aDB182F55741E267730dfbfb4F1944C205",
      "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
      "0xc3C65cB7aa6D36F051f875708b8E17f9a0B210eD",
    ],
  },
} as const;
const callTargetAbi = parseAbi(["function called() view returns (bool)", "function perform_call()"]);

describe("Voting upgrade snapshots", function () {
  it("preserves create, three YES votes, wait and enact observations", async function () {
    const context = getSnapshotContext(this);
    const { client, createsVote, testUpgrade } = context;
    const network = client.getNetworkName();
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Unsupported snapshot network ${network}`);
    }
    const { holder, voters } = accounts[network];
    const { voting, tokenManager } = getGovernanceContracts(network);
    let voteTime: bigint;
    let callTarget: ReturnType<typeof contract<typeof callTargetAbi>>;
    let before: Record<string, Record<string, unknown>>;

    async function send(to: Address, data: Hex, sender: Address): Promise<void> {
      const hash = await client.viemClient.sendTransaction({
        account: sender,
        to,
        data,
        chain: client.viemClient.chain,
        gasPrice: 2_000_000_000n,
      });
      assert.equal(
        (await client.viemClient.waitForTransactionReceipt({ hash })).status,
        "success",
        "voting scenario transaction",
      );
    }

    async function snapshot(voteId: bigint): Promise<Record<string, unknown>> {
      const vote = await client.read(voting, "getVote", [voteId]);
      const observations: Record<string, unknown> = {
        address: voting.address,
        voteTime: await client.read(voting, "voteTime"),
        CREATE_VOTES_ROLE: await client.read(voting, "CREATE_VOTES_ROLE"),
        MODIFY_SUPPORT_ROLE: await client.read(voting, "MODIFY_SUPPORT_ROLE"),
        MODIFY_QUORUM_ROLE: await client.read(voting, "MODIFY_QUORUM_ROLE"),
        UNSAFELY_MODIFY_VOTE_TIME_ROLE: await client.read(voting, "UNSAFELY_MODIFY_VOTE_TIME_ROLE"),
        PCT_BASE: await client.read(voting, "PCT_BASE"),
        minAcceptQuorumPct: await client.read(voting, "minAcceptQuorumPct"),
        supportRequiredPct: await client.read(voting, "supportRequiredPct"),
        votesLength: await client.read(voting, "votesLength"),
        objectionPhaseTime: await client.read(voting, "objectionPhaseTime"),
        token: await client.read(voting, "token"),
        vote_open: vote[0],
        vote_executed: vote[1],
        vote_supportRequired: vote[4],
        vote_minAcceptQuorum: vote[5],
        vote_yea: vote[6],
        vote_nay: vote[7],
        vote_votingPower: vote[8],
        vote_script: vote[9],
        vote_canExecute: await client.read(voting, "canExecute", [voteId]),
      };
      for (const [index, voter] of voters.entries()) {
        observations[`vote_voter${index + 1}_state`] = await client.read(voting, "getVoterState", [voteId, voter]);
      }
      return observations;
    }

    async function steps(): Promise<Record<string, Record<string, unknown>>> {
      const impersonated = new ImpersonatedAccounts();
      try {
        // Scripts assigns exactly 10 ETH to every sender on each branch.
        for (const sender of new Set([holder, ...voters].map((account) => getAddress(account)))) {
          await impersonated.impersonate(client, sender);
        }
        const script = EvmScriptParser.encode([
          {
            address: callTarget.address,
            calldata: encodeFunctionData({ abi: callTargetAbi, functionName: "perform_call" }),
          },
        ]);
        const voteId = await client.read(voting, "votesLength");
        const newVoteScript = EvmScriptParser.encode([
          {
            address: voting.address,
            calldata: encodeFunctionData({
              abi: voting.abi,
              functionName: "newVote",
              args: [script, "Omnibus vote: Test voting.", false, false],
            }),
          },
        ]);
        await send(
          tokenManager.address,
          encodeFunctionData({ abi: tokenManager.abi, functionName: "forward", args: [newVoteScript] }),
          holder,
        );
        const frames: Record<string, Record<string, unknown>> = { create: await snapshot(voteId) };
        for (const [index, voter] of voters.entries()) {
          await send(
            voting.address,
            encodeFunctionData({ abi: voting.abi, functionName: "vote", args: [voteId, true, false] }),
            voter,
          );
          frames[`vote_#${index}`] = await snapshot(voteId);
        }
        await client.advanceTime(voteTime + 100n);
        frames.wait = await snapshot(voteId);
        assert.isFalse(await client.read(callTarget, "called"), "target before enactment");
        await send(
          voting.address,
          encodeFunctionData({ abi: voting.abi, functionName: "executeVote", args: [voteId] }),
          holder,
        );
        assert.isTrue(await client.read(callTarget, "called"), "target after enactment");
        frames.enact = await snapshot(voteId);
        return frames;
      } finally {
        await impersonated.stopAll(client);
      }
    }

    await testUpgrade({
      beforeExecution: async () => {
        voteTime = await client.read(voting, "voteTime");
        await hre.tasks
          .getTask("build")
          .run({ files: ["contracts/mocks/MockSnapshotCallTarget.sol"], noTests: true, quiet: true });
        await hre.artifacts.clearCache();
        const artifact = await hre.artifacts.readArtifact("MockSnapshotCallTarget");
        if (!isHex(artifact.bytecode)) {
          throw new Error("MockSnapshotCallTarget artifact has invalid bytecode");
        }
        const deployer = await getLocalAccount(client, 0);
        callTarget = contract(
          callTargetAbi,
          await client.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode }, { from: deployer }),
        );
        before = await client.withSnapshot(async () => {
          if (createsVote) {
            // Mirrors the LDO transfer made by launching the upgrade vote; its funder votes here on Hoodi
            await client.stopImpersonating(await setupLdoHolder(client));
          }
          return steps();
        });
      },
      afterExecution: async () => {
        const after = await steps();
        assert.deepEqual(Object.keys(after), Object.keys(before), "voting frame names");
        for (const step of Object.keys(before)) {
          const scope = `voting/${step}`;
          const oldFrame = { ...before[step] };
          const newFrame = { ...after[step] };
          if (createsVote && !hasExpectedSnapshotChange(context, `${scope}/votesLength`)) {
            const oldLength = oldFrame.votesLength;
            if (typeof oldLength !== "bigint") {
              throw new Error(`${scope}/votesLength is not an integer observation`);
            }
            assert.equal(newFrame.votesLength, oldLength + 1n, `${scope}: the upgrade created one vote`);
            delete oldFrame.votesLength;
            delete newFrame.votesLength;
          }
          assertSnapshot(context, scope, oldFrame, newFrame);
        }
      },
    });
  });
});
