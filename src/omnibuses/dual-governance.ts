import { TransactionReceipt } from "viem";
import bytes from "../common/bytes";
import { contract, getEventAbi } from "../contracts";
import { DevRpcClient } from "../network";
import { DualGovernanceConfigProvider_ABI } from "../../abi/DualGovernanceConfigProvider.abi";
import { getGovernanceContracts } from "./governance-contracts";
import { KnownError } from "../common/errors";

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
  const { timelock, dualGovernance } = getGovernanceContracts(client.getNetworkName());

  const dualGovernanceConfigProvider = contract(
    DualGovernanceConfigProvider_ABI,
    await client.read(dualGovernance, "getConfigProvider", []),
  );

  const governance = await client.read(timelock, "getGovernance", []);

  if (!bytes.isEqual(governance, dualGovernance.address)) {
    throw new Error("Unexpected governance address");
  }

  const [dgStateDetails, dgConfig] = await Promise.all([
    client.read(dualGovernance, "getStateDetails", []),
    client.read(dualGovernanceConfigProvider, "getDualGovernanceConfig", []),
  ]);

  if (dgStateDetails.effectiveState === DgState.VetoSignallingDeactivation) {
    await client.advanceTime(dgConfig.vetoSignallingDeactivationMaxDuration);
  }

  if (dgStateDetails.effectiveState === DgState.VetoSignalling) {
    const vetSignallingEndDate = dgStateDetails.vetoSignallingActivatedAt + dgStateDetails.vetoSignallingDuration;
    const currentTimestamp = await client.getChainTime();
    if (vetSignallingEndDate < currentTimestamp) {
      throw new Error("Invalid veto signalling duration or outdated DG state");
    }
    await client.setTime(vetSignallingEndDate + 1);
  }

  const effectiveDgState = await client.read(dualGovernance, "getEffectiveState", []);

  if (effectiveDgState !== DgState.Normal && effectiveDgState !== DgState.VetoCooldown) {
    throw new Error(`Invalid DG state: ${DgState[effectiveDgState]}`);
  }
}

/** `fromBlock` is the Aragon execution block: logs of proposals executed earlier on chain are searched from it. */
export async function processPendingProposals(client: DevRpcClient, proposalIds: bigint[], fromBlock: bigint) {
  if (proposalIds.length === 0) {
    return [];
  }

  const { timelock, dualGovernance } = getGovernanceContracts(client.getNetworkName());

  const [timestamp, [stranger], afterSubmitDelay, afterScheduleDelay] = await Promise.all([
    client.getChainTime(),
    client.getAccounts(),
    client.read(timelock, "getAfterSubmitDelay", []),
    client.read(timelock, "getAfterScheduleDelay", []),
  ]);

  const proposals = await Promise.all(proposalIds.map((id) => client.read(timelock, "getProposalDetails", [id])));
  const proposalsToSchedule = proposals.filter((proposal) => proposal.status === ProposalStatus.Submitted);

  const latestSubmitTimestamp = Math.max(...proposalsToSchedule.map((proposal) => proposal.submittedAt), 0);

  if (timestamp < latestSubmitTimestamp + afterSubmitDelay) {
    await client.setTime(latestSubmitTimestamp + afterSubmitDelay + 1);
  }

  await prepareDualGovernanceState(client);

  for (const proposal of proposalsToSchedule) {
    const canScheduleProposal = await client.read(dualGovernance, "canScheduleProposal", [proposal.id]);
    if (!canScheduleProposal) {
      throw new Error(`Proposal ${proposal.id} can not be scheduled`);
    }
    await client.write(dualGovernance, "scheduleProposal", [proposal.id], { from: stranger });
  }

  await client.advanceTime(afterScheduleDelay);

  const executeProposalReceipts: TransactionReceipt[] = [];
  for (const proposalId of proposalIds) {
    const proposal = await client.read(timelock, "getProposalDetails", [proposalId]);
    if (proposal.status === ProposalStatus.Executed) {
      const [proposalExecutedLog] = await client.getLogsInWindows(
        {
          address: timelock.address,
          event: getEventAbi(timelock, "ProposalExecuted"),
          args: [proposalId],
          fromBlock,
        },
        true,
      );
      if (!proposalExecutedLog) {
        throw new KnownError(`ProposalExecuted event of proposal ${proposalId} not found from block ${fromBlock}`);
      }

      executeProposalReceipts.push(await client.getTransactionReceipt({ hash: proposalExecutedLog.transactionHash }));

      continue;
    }
    const canExecuteProposal = await client.read(timelock, "canExecute", [proposalId]);
    if (!canExecuteProposal) {
      throw new Error(`Proposal ${proposalId} can not be executed`);
    }
    const executeReceipt = await client.write(timelock, "execute", [proposalId], { from: stranger });

    executeProposalReceipts.push(executeReceipt);
  }

  return executeProposalReceipts;
}
