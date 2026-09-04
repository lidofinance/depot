import { Address, encodeErrorResult, Hex, slice } from "viem";

import { AccessControl_ABI } from "../../../../abi/AccessControl.abi";
import { Agent_ABI } from "../../../../abi/Agent.abi";
import { AllowedRecipientsRegistry_ABI } from "../../../../abi/AllowedRecipientsRegistry.abi";
import { HashConsensus_ABI } from "../../../../abi/HashConsensus.abi";
import { NodeOperatorsRegistry_ABI } from "../../../../abi/NodeOperatorsRegistry.abi";
import { TimeConstraints_ABI } from "../../../../abi/TimeConstraints.abi";
import { assert } from "../../../../src/common/assert";
import { Contract, contract, createContracts } from "../../../../src/contracts";
import { DevRpcClient } from "../../../../src/network";
import { AclOp, aclParam, event, expectedEvents as ev, Omnibus } from "../../../../src/omnibuses";
import { getGovernanceContracts } from "../../../../src/omnibuses/governance-contracts";

const contracts = createContracts({
  agent: [Agent_ABI, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
  nodeOperatorsRegistry: [NodeOperatorsRegistry_ABI, "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5"],
  allianceOpsStablecoinsRegistry: [AllowedRecipientsRegistry_ABI, "0x3B525F4c059F246Ca4aa995D21087204F30c9E2F"],
  veboHashConsensus: [HashConsensus_ABI, "0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a"],
  timeConstraints: [TimeConstraints_ABI, "0x2a30F5aC03187674553024296bed35Aa49749DDa"],
});
const governance = getGovernanceContracts("mainnet");

// the vote this omnibus reproduces; its script stays in Voting storage, so the byte check works on any fork after it
const VOTE_ID = 201n;

const DAY_SECONDS = 86_400;
// execution of the proposal must land inside the 13:00 - 16:30 UTC window the vote itself checks
const EXECUTION_DAY_TIME_INSIDE_WINDOW = 14 * 3600 + 30 * 60;
const EXECUTION_DAY_TIME_OUTSIDE_WINDOW = 18 * 3600;
const DAY_TIME_OUT_OF_RANGE_SELECTOR = slice(
  encodeErrorResult({ abi: TimeConstraints_ABI, errorName: "DayTimeOutOfRange", args: [0, 0, 0] }),
  0,
  4,
);

// a neighbouring operator id the Consensys manager must not be able to touch
const OTHER_NODE_OPERATOR_ID = 22n;
const TEST_PUBLIC_KEY: Hex = `0x${"01".repeat(48)}`;
const TEST_SIGNATURE: Hex = `0x${"02".repeat(96)}`;

const DG_ITEM_TITLE =
  "Submit a Dual Governance proposal to extend Dual Governance Emergency Protection until June 20 2027, grant MANAGE_SIGNING_KEYS role to Node Operator Consensys, increase Alliance Ops stablecoins Easy Track factory limit from $250K per 3 months to $5M per 6 months, reduce VEBO Reporting Frame from 75 to 45 epochs";

// the omnibus contract is the source of every vote-scoped value; the artifact ABI is untyped, hence the casts
async function readVoteConstants(client: DevRpcClient, omnibus: Contract) {
  const constant = <T>(name: string) => client.read(omnibus, name, []) as Promise<T>;
  const [
    newEmergencyProtectionEndDate,
    manageSigningKeysRole,
    consensysNodeOperatorId,
    consensysSigningKeysManager,
    allianceOpsNewLimit,
    allianceOpsNewPeriodDurationMonths,
    manageFrameConfigRole,
    veboNewEpochsPerFrame,
    veboFastLaneLengthSlots,
    executionWindowStartDayTime,
    executionWindowEndDayTime,
  ] = await Promise.all([
    constant<number>("NEW_EMERGENCY_PROTECTION_END_DATE"),
    constant<Hex>("MANAGE_SIGNING_KEYS"),
    constant<bigint>("CONSENSYS_NODE_OPERATOR_ID"),
    constant<Address>("CONSENSYS_SIGNING_KEYS_MANAGER"),
    constant<bigint>("ALLIANCE_OPS_NEW_LIMIT"),
    constant<bigint>("ALLIANCE_OPS_NEW_PERIOD_DURATION_MONTHS"),
    constant<Hex>("MANAGE_FRAME_CONFIG_ROLE"),
    constant<bigint>("VEBO_NEW_EPOCHS_PER_FRAME"),
    constant<bigint>("VEBO_FAST_LANE_LENGTH_SLOTS"),
    constant<number>("EXECUTION_WINDOW_START_DAY_TIME"),
    constant<number>("EXECUTION_WINDOW_END_DAY_TIME"),
  ]);
  return {
    newEmergencyProtectionEndDate,
    manageSigningKeysRole,
    consensysNodeOperatorId,
    consensysSigningKeysManager,
    allianceOpsNewLimit,
    allianceOpsNewPeriodDurationMonths,
    manageFrameConfigRole,
    veboNewEpochsPerFrame,
    veboFastLaneLengthSlots,
    executionWindowStartDayTime,
    executionWindowEndDayTime,
  };
}

type VoteConstants = Awaited<ReturnType<typeof readVoteConstants>>;

function manageSigningKeysParams(vote: VoteConstants) {
  return [aclParam(0, AclOp.EQ, vote.consensysNodeOperatorId)];
}

function manageFrameConfigGrant(vote: VoteConstants) {
  const { agent, veboHashConsensus } = contracts;
  return {
    contracts: { accessControl: contract(AccessControl_ABI, veboHashConsensus.address, veboHashConsensus.label) },
    role: vote.manageFrameConfigRole,
    account: agent.address,
  };
}

async function readTotalAddedValidators(client: DevRpcClient, nodeOperatorId: bigint) {
  const [, , , , , totalAddedValidators] = await client.read(contracts.nodeOperatorsRegistry, "getNodeOperator", [
    nodeOperatorId,
    false,
  ]);
  return totalAddedValidators;
}

async function readFrameConfig(client: DevRpcClient) {
  const [initialEpoch, epochsPerFrame, fastLaneLengthSlots] = await client.read(
    contracts.veboHashConsensus,
    "getFrameConfig",
    [],
  );
  return { initialEpoch, epochsPerFrame, fastLaneLengthSlots };
}

async function readEmergencyProtectionEndDate(client: DevRpcClient) {
  const details = await client.read(governance.timelock, "getEmergencyProtectionDetails", []);
  return details.emergencyProtectionEndsAfter;
}

async function canManageSigningKeys(client: DevRpcClient, vote: VoteConstants, nodeOperatorId: bigint) {
  return client.read(contracts.nodeOperatorsRegistry, "canPerform", [
    vote.consensysSigningKeysManager,
    vote.manageSigningKeysRole,
    [nodeOperatorId],
  ]);
}

/** The permission is proven by using it: the manager adds a key to the operator it was granted for. */
async function checkManagerAddsSigningKeys(client: DevRpcClient, vote: VoteConstants, nodeOperatorId: bigint) {
  const manager = vote.consensysSigningKeysManager;
  await client.withSnapshot(async () => {
    await client.impersonate(manager, 10n ** 18n);
    const keysBefore = await readTotalAddedValidators(client, nodeOperatorId);
    await client.write(
      contracts.nodeOperatorsRegistry,
      "addSigningKeys",
      [nodeOperatorId, 1n, TEST_PUBLIC_KEY, TEST_SIGNATURE],
      { from: manager },
    );
    const keysAfter = await readTotalAddedValidators(client, nodeOperatorId);
    assert.equal(keysAfter, keysBefore + 1n);
  });
}

async function checkManagerCannotAddSigningKeys(client: DevRpcClient, vote: VoteConstants, nodeOperatorId: bigint) {
  const manager = vote.consensysSigningKeysManager;
  await client.withSnapshot(async () => {
    await client.impersonate(manager, 10n ** 18n);
    const addSigningKeys = client.write(
      contracts.nodeOperatorsRegistry,
      "addSigningKeys",
      [nodeOperatorId, 1n, TEST_PUBLIC_KEY, TEST_SIGNATURE],
      { from: manager },
    );
    await assert.reverts(addSigningKeys, "APP_AUTH_FAILED");
  });
}

/**
 * Moves the chain so that the proposal, scheduled right away and executed after the timelock delay,
 * is executed at `dayTime` seconds after a UTC midnight.
 */
async function alignProposalExecution(client: DevRpcClient, proposalId: bigint, dayTime: number) {
  const [{ submittedAt }, afterSubmitDelay, afterScheduleDelay, chainTime] = await Promise.all([
    client.read(governance.timelock, "getProposalDetails", [proposalId]),
    client.read(governance.timelock, "getAfterSubmitDelay", []),
    client.read(governance.timelock, "getAfterScheduleDelay", []),
    client.getChainTime(),
  ]);
  const earliestSchedule = Math.max(chainTime + 1, submittedAt + afterSubmitDelay + 1);
  const earliestExecution = earliestSchedule + afterScheduleDelay;
  const executionDayStart = earliestExecution - (earliestExecution % DAY_SECONDS);
  const execution =
    executionDayStart + dayTime < earliestExecution
      ? executionDayStart + DAY_SECONDS + dayTime
      : executionDayStart + dayTime;
  await client.setTime(execution - afterScheduleDelay);
}

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const isValidVoteScript = (await client.read(deployment.omnibus, "isValidVoteScript", [VOTE_ID])) as boolean;
    assert.isTrue(isValidVoteScript, `EVM script of the contract differs from the script of vote #${VOTE_ID}`);

    const vote = await readVoteConstants(client, deployment.omnibus);
    const { nodeOperatorsRegistry, allianceOpsStablecoinsRegistry, veboHashConsensus } = contracts;

    // the role hashes of the description are the ones the target contracts declare
    assert.equal(vote.manageSigningKeysRole, await client.read(nodeOperatorsRegistry, "MANAGE_SIGNING_KEYS", []));
    assert.equal(vote.manageFrameConfigRole, await client.read(veboHashConsensus, "MANAGE_FRAME_CONFIG_ROLE", []));

    const endDateBefore = await readEmergencyProtectionEndDate(client);
    assert.notEqual(endDateBefore, vote.newEmergencyProtectionEndDate);

    assert.isFalse(await canManageSigningKeys(client, vote, vote.consensysNodeOperatorId));

    const [limitBefore, periodDurationMonthsBefore] = await client.read(
      allianceOpsStablecoinsRegistry,
      "getLimitParameters",
      [],
    );
    assert.notEqual(limitBefore, vote.allianceOpsNewLimit);
    assert.notEqual(periodDurationMonthsBefore, vote.allianceOpsNewPeriodDurationMonths);

    const frameConfigBefore = await readFrameConfig(client);
    assert.notEqual(frameConfigBefore.epochsPerFrame, vote.veboNewEpochsPerFrame);
    // the description does not name the fast lane length: the vote must keep the one already on-chain
    assert.equal(frameConfigBefore.fastLaneLengthSlots, vote.veboFastLaneLengthSlots);
    await checks.accessControl.checkOzRoleNotGranted(manageFrameConfigGrant(vote));

    const { voteEvents } = await passOmnibus();

    voteEvents.item(DG_ITEM_TITLE);

    // the vote only submits the proposal: nothing changes until it is executed
    assert.equal(await readEmergencyProtectionEndDate(client), endDateBefore);
    assert.isFalse(await canManageSigningKeys(client, vote, vote.consensysNodeOperatorId));
    assert.deepEqual(await client.read(allianceOpsStablecoinsRegistry, "getLimitParameters", []), [
      limitBefore,
      periodDurationMonthsBefore,
    ]);
    assert.deepEqual(await readFrameConfig(client), frameConfigBefore);
  },

  testProposal: async ({ client, checks, passProposals, deployment, submittedProposalIds }) => {
    const vote = await readVoteConstants(client, deployment.omnibus);
    const { agent, nodeOperatorsRegistry, allianceOpsStablecoinsRegistry, veboHashConsensus, timeConstraints } =
      contracts;
    const [proposalId] = submittedProposalIds;

    await checkManagerCannotAddSigningKeys(client, vote, vote.consensysNodeOperatorId);

    // the execution window is the point of the last item: outside it the whole proposal reverts
    await client.withSnapshot(async () => {
      await alignProposalExecution(client, proposalId, EXECUTION_DAY_TIME_OUTSIDE_WINDOW);
      await assert.reverts(passProposals(), DAY_TIME_OUT_OF_RANGE_SELECTOR);
    });

    await alignProposalExecution(client, proposalId, EXECUTION_DAY_TIME_INSIDE_WINDOW);
    const [proposal] = (await passProposals()).proposalEvents;

    const frameConfigAfter = await readFrameConfig(client);
    const [, , periodStartAfter] = await client.read(allianceOpsStablecoinsRegistry, "getPeriodState", []);

    // the Agent runs each forwarded call through CallsScript, which logs the call before making it
    const forwardedCall = (target: Address) =>
      event(governance.callsScript, "LogScriptCall", [governance.adminExecutor.address, agent.address, target], {
        emitter: agent.address,
      });
    const scriptResult = event(agent, "ScriptResult", [governance.callsScript.address, null, "0x", "0x"]);

    proposal.call(0, [
      event(governance.timelock, "EmergencyProtectionEndDateSet", [vote.newEmergencyProtectionEndDate]),
    ]);
    proposal.call(1, [
      forwardedCall(governance.acl.address),
      ...ev.accessControl.permissionGranted(governance.acl, {
        entity: vote.consensysSigningKeysManager,
        app: nodeOperatorsRegistry.address,
        role: vote.manageSigningKeysRole,
        params: manageSigningKeysParams(vote),
      }),
      scriptResult,
    ]);
    proposal.call(2, [
      forwardedCall(allianceOpsStablecoinsRegistry.address),
      event(allianceOpsStablecoinsRegistry, "CurrentPeriodAdvanced", [periodStartAfter]),
      event(allianceOpsStablecoinsRegistry, "LimitsParametersChanged", [
        vote.allianceOpsNewLimit,
        vote.allianceOpsNewPeriodDurationMonths,
      ]),
      scriptResult,
    ]);
    proposal.call(3, [
      forwardedCall(veboHashConsensus.address),
      ...ev.accessControl.roleGranted(veboHashConsensus, { role: vote.manageFrameConfigRole, to: agent.address }),
      scriptResult,
    ]);
    proposal.call(4, [
      forwardedCall(veboHashConsensus.address),
      event(veboHashConsensus, "FrameConfigSet", [frameConfigAfter.initialEpoch, vote.veboNewEpochsPerFrame]),
      scriptResult,
    ]);
    proposal.call(5, [
      forwardedCall(veboHashConsensus.address),
      ...ev.accessControl.roleRevoked(veboHashConsensus, { role: vote.manageFrameConfigRole, from: agent.address }),
      scriptResult,
    ]);
    proposal.call(6, [
      event(timeConstraints, "TimeWithinDayTimeChecked", [
        vote.executionWindowStartDayTime,
        vote.executionWindowEndDayTime,
      ]),
    ]);

    assert.equal(await readEmergencyProtectionEndDate(client), vote.newEmergencyProtectionEndDate);

    await checks.accessControl.checkAragonPermissionParams({
      contracts: { acl: governance.acl },
      entity: vote.consensysSigningKeysManager,
      app: nodeOperatorsRegistry.address,
      role: vote.manageSigningKeysRole,
      params: manageSigningKeysParams(vote),
    });
    assert.isTrue(await canManageSigningKeys(client, vote, vote.consensysNodeOperatorId));
    assert.isFalse(await canManageSigningKeys(client, vote, OTHER_NODE_OPERATOR_ID));
    await checkManagerAddsSigningKeys(client, vote, vote.consensysNodeOperatorId);
    await checkManagerCannotAddSigningKeys(client, vote, OTHER_NODE_OPERATOR_ID);

    assert.deepEqual(await client.read(allianceOpsStablecoinsRegistry, "getLimitParameters", []), [
      vote.allianceOpsNewLimit,
      vote.allianceOpsNewPeriodDurationMonths,
    ]);

    assert.equal(frameConfigAfter.epochsPerFrame, vote.veboNewEpochsPerFrame);
    assert.equal(frameConfigAfter.fastLaneLengthSlots, vote.veboFastLaneLengthSlots);
    await checks.accessControl.checkOzRoleNotGranted(manageFrameConfigGrant(vote));
  },
});
