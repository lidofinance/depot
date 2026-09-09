import { Address } from "abitype";
import { assert } from "chai";
import { encodeFunctionData } from "viem";

import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import {
  decodeSubmitProposalMetadata,
  getSubmitProposalCallIndexes,
  isSubmitProposalCall,
} from "../../src/omnibuses/omnibus-contract-calls";
import { VoteCall } from "../../src/omnibuses/omnibus-types";

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

function createDirectCall(title = "Direct call"): VoteCall {
  return {
    title,
    target: AGENT,
    payload: "0x11223344",
  };
}

describe("omnibus contract calls", () => {
  describe("isSubmitProposalCall", () => {
    it("recognizes a call of submitProposal on the governance contract", () => {
      assert.isTrue(isSubmitProposalCall(createSubmitProposalCall("Proposal description"), GOVERNANCE));
    });

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

    it("rejects a payload shorter than a selector", () => {
      const call: VoteCall = { title: "Empty payload", target: GOVERNANCE, payload: "0x" };
      assert.isFalse(isSubmitProposalCall(call, GOVERNANCE));
    });
  });

  describe("getSubmitProposalCallIndexes", () => {
    it("returns the indexes of the submitting items in the order of the vote", () => {
      const calls = [
        createDirectCall("First"),
        createSubmitProposalCall("First proposal", "Second"),
        createDirectCall("Third"),
        createSubmitProposalCall("Second proposal", "Fourth"),
      ];

      assert.deepEqual(getSubmitProposalCallIndexes(calls, GOVERNANCE), [1, 3]);
    });

    it("returns nothing when the vote submits no proposals", () => {
      assert.deepEqual(getSubmitProposalCallIndexes([createDirectCall()], GOVERNANCE), []);
    });
  });

  describe("decodeSubmitProposalMetadata", () => {
    it("returns the metadata argument as it was encoded", () => {
      const metadata = "Proposal description with  double  spaces and a trailing dot.";
      assert.equal(decodeSubmitProposalMetadata(createSubmitProposalCall(metadata)), metadata);
    });

    it("keeps line breaks of a multiline metadata", () => {
      const metadata = "First line\nSecond line";
      assert.equal(decodeSubmitProposalMetadata(createSubmitProposalCall(metadata)), metadata);
    });

    it("fails on a call of another method", () => {
      const call: VoteCall = {
        title: "Schedule proposal",
        target: GOVERNANCE,
        payload: encodeFunctionData({ abi: IGovernance_ABI, functionName: "scheduleProposal", args: [1n] }),
      };

      assert.throws(() => decodeSubmitProposalMetadata(call), /doesn't call "submitProposal"/);
    });
  });
});
