import { Address } from "abitype";

import { HashConsensus_ABI } from "../../../abi/HashConsensus.abi";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type HashConsensusContract = Contract<typeof HashConsensus_ABI>;

function memberAdded(
  hashConsensus: HashConsensusContract,
  input: { member: Address; totalMembers: bigint; quorum: bigint },
): OmnibusCallEvent[] {
  return [event(hashConsensus, "MemberAdded", [input.member, input.totalMembers, input.quorum])];
}

function memberRemoved(
  hashConsensus: HashConsensusContract,
  input: { member: Address; totalMembers: bigint; quorum: bigint },
): OmnibusCallEvent[] {
  return [event(hashConsensus, "MemberRemoved", [input.member, input.totalMembers, input.quorum])];
}

export default { memberAdded, memberRemoved };
