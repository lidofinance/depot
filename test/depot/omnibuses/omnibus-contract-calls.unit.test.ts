import { Address } from "abitype";
import { assert } from "chai";
import { encodeFunctionData } from "viem";

import { IGovernance_ABI } from "@/abi/IGovernance.abi";
import { isSubmitProposalCall } from "@/src/omnibuses/omnibus-contract-calls";
import { VoteCall } from "@/src/omnibuses/omnibus-types";

const GOVERNANCE: Address = "0xC1db28B3301331277e307FDCfF8DE28242A4486E";
const GOVERNANCE_LOWERCASE: Address = "0xc1db28b3301331277e307fdcff8de28242a4486e";
const AGENT: Address = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";

function createSubmitProposalCall(metadata: string, title = "Submit proposal to Dual Governance"): VoteCall {
  return {
    title,
    target: GOVERNANCE,
    payload: encodeFunctionData({
      abi: IGovernance_ABI,
      functionName: "submitProposal",
      args: [[{ target: AGENT, value: 0n, payload: "0x1234" }], metadata],
    }),
  };
}

describe("omnibus contract calls", () => {
  describe("isSubmitProposalCall", () => {
    it("ignores the case of the target address", () => {
      const call = { ...createSubmitProposalCall("Proposal description"), target: GOVERNANCE_LOWERCASE };
      assert.isTrue(isSubmitProposalCall(call, GOVERNANCE));
    });

    it("rejects the same payload sent to another contract", () => {
      const call = { ...createSubmitProposalCall("Proposal description"), target: AGENT };
      assert.isFalse(isSubmitProposalCall(call, GOVERNANCE));
    });

    it("rejects another method of the governance contract", () => {
      const call: VoteCall = {
        title: "Schedule proposal",
        target: GOVERNANCE,
        payload: encodeFunctionData({ abi: IGovernance_ABI, functionName: "scheduleProposal", args: [1n] }),
      };
      assert.isFalse(isSubmitProposalCall(call, GOVERNANCE));
    });
  });
});
