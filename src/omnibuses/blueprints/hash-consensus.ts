import { Address } from "abitype";
import { HashConsensus_ABI } from "../../../abi/HashConsensus.abi";
import { Contract } from "../../contracts";
import { BlueprintCtx } from "../omnibus";

interface RemoveMemberInput {
  title: string;
  contract: Contract<typeof HashConsensus_ABI>;
  member: Address;
  quorum: bigint;
  newMembersCount: bigint;
}

interface AddMemberInput {
  title: string;
  contract: Contract<typeof HashConsensus_ABI>;
  member: Address;
  quorum: bigint;
  newMembersCount: bigint;
}

function removeMemberCall(ctx: BlueprintCtx, input: RemoveMemberInput) {
  return ctx.directCall(input.title, {
    on: input.contract,
    fn: "removeMember",
    args: [input.member, input.quorum],
    events: [ctx.event(input.contract, "MemberRemoved", [null, input.newMembersCount, input.quorum])],
  });
}

function addMemberCall(ctx: BlueprintCtx, input: AddMemberInput) {
  return ctx.directCall(input.title, {
    on: input.contract,
    fn: "addMember",
    args: [input.member, input.quorum],
    events: [ctx.event(input.contract, "MemberAdded", [null, input.newMembersCount, input.quorum])],
  });
}

export default {
  addMemberCall,
  removeMemberCall,
};
