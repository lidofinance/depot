import { TransactionReceipt } from "viem";
import bytes from "../common/bytes";
import { getEventAbi, getLidoContracts } from "../contracts";
import { DevRpcClient } from "../network";

enum DgState {
  NotInitialized = 0,
  Normal = 1,
  VetoSignalling = 2,
  VetoSignallingDeactivation = 3,
  VetoCooldown = 4,
  RageQuit = 5,
}

export enum ProposalStatus {
  NotExist = 0,
  Submitted = 1,
  Scheduled = 2,
  Executed = 3,
  Cancelled = 4,
}

async function prepareDualGovernanceState(client: DevRpcClient) {
  const { emergencyProtectedTimelock, dualGovernance, dualGovernanceConfigProvider } = getLidoContracts(
    client.getNetworkName(),
  );

  const governance = await client.read(emergencyProtectedTimelock, "getGovernance", []);

  if (!bytes.isEqual(governance, dualGovernance.address)) {
    throw new Error("Unexpected governance address");
  }

  const [dgStateDetails, dgConfig] = await Promise.all([
    client.read(dualGovernance, "getStateDetails", []),
    client.read(dualGovernanceConfigProvider, "getDualGovernanceConfig", []),
  ]);

  if (dgStateDetails.effectiveState === DgState.VetoSignallingDeactivation) {
    await client.increaseTime(dgConfig.vetoSignallingDeactivationMaxDuration);
  }

  if (dgStateDetails.effectiveState === DgState.VetoSignalling) {
    const vetSignallingEndDate = dgStateDetails.vetoSignallingActivatedAt + dgStateDetails.vetoSignallingDuration;
    const currentTimestamp = await client.getChainTime();
    if (vetSignallingEndDate < currentTimestamp) {
      throw new Error("Invalid veto signalling duration or outdated DG state");
    }
    await client.increaseTime(vetSignallingEndDate - currentTimestamp + 1);
  }

  const effectiveDgState = await client.read(dualGovernance, "getEffectiveState", []);

  if (effectiveDgState !== DgState.Normal && effectiveDgState !== DgState.VetoCooldown) {
    throw new Error(`Invalid DG state: ${DgState[effectiveDgState]}`);
  }
}

export async function processPendingProposals(client: DevRpcClient, proposalIds: bigint[]) {
  const { emergencyProtectedTimelock, dualGovernance } = getLidoContracts(client.getNetworkName());

  const [timestamp, [stranger], afterSubmitDelay, afterScheduleDelay] = await Promise.all([
    client.getChainTime(),
    client.getAccounts(),
    client.read(emergencyProtectedTimelock, "getAfterSubmitDelay", []),
    client.read(emergencyProtectedTimelock, "getAfterScheduleDelay", []),
  ]);

  const proposals = await Promise.all(
    proposalIds.map((id) => client.read(emergencyProtectedTimelock, "getProposalDetails", [id])),
  );
  const proposalsToSchedule = proposals.filter((proposal) => proposal.status === ProposalStatus.Submitted);

  const latestSubmitTimestamp = Math.max(...proposalsToSchedule.map((proposal) => proposal.submittedAt), 0);

  if (timestamp < latestSubmitTimestamp + afterSubmitDelay) {
    await client.increaseTime(latestSubmitTimestamp + afterSubmitDelay - timestamp + 1);
  }

  await prepareDualGovernanceState(client);

  for (const proposal of proposalsToSchedule) {
    const canScheduleProposal = await client.read(dualGovernance, "canScheduleProposal", [proposal.id]);
    if (!canScheduleProposal) {
      throw new Error(`Proposal ${proposal.id} can not be scheduled`);
    }
    await client.write(dualGovernance, "scheduleProposal", [proposal.id], { from: stranger });
  }

  await client.increaseTime(afterScheduleDelay);

  const executeProposalReceipts: TransactionReceipt[] = [];
  for (const proposalId of proposalIds) {
    const proposal = await client.read(emergencyProtectedTimelock, "getProposalDetails", [proposalId]);
    if (proposal.status === ProposalStatus.Executed) {
      const proposalExecutedFilter = await client.viemClient.createEventFilter({
        address: emergencyProtectedTimelock.address,
        event: getEventAbi(emergencyProtectedTimelock, "ProposalExecuted"),
        args: [proposalId],
        fromBlock: (await client.viemClient.getBlockNumber()) - 500n, // TODO: handle it better
      });
      const proposalExecutedLogs = await client.viemClient.getFilterLogs({ filter: proposalExecutedFilter });
      if (proposalExecutedLogs.length === 0) {
        throw new Error(`"ProposalExecuted" log for proposal with id ${proposalId} not found`);
      }

      executeProposalReceipts.push(
        await client.viemClient.getTransactionReceipt({ hash: proposalExecutedLogs[0].transactionHash }),
      );

      continue;
    }
    const canExecuteProposal = await client.read(emergencyProtectedTimelock, "canExecute", [proposalId]);
    if (!canExecuteProposal) {
      throw new Error(`Proposal ${proposalId} can not be executed`);
    }
    const executeReceipt = await client.write(emergencyProtectedTimelock, "execute", [proposalId], { from: stranger });

    executeProposalReceipts.push(executeReceipt);
  }

  return executeProposalReceipts;
}
