import { GovernanceContracts } from "../governance-contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";
import type { ExternalCall } from "../vote-events";

function proposalSubmitted(
  { voting, timelock, dualGovernance }: GovernanceContracts,
  input: { calls: ExternalCall[]; metadata: string },
): OmnibusCallEvent[] {
  return [
    event(timelock, "ProposalSubmitted", [null, null, input.calls]),
    event(dualGovernance, "ProposalSubmitted", [voting.address, null, input.metadata]),
  ];
}

export default { proposalSubmitted };
