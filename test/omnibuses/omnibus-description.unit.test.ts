import { assert } from "chai";
import { encodeFunctionData } from "viem";

import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import {
  assertDgProposalDescriptions,
  formatVoteDescription,
  parseDgProposalDescriptions,
} from "../../src/omnibuses/omnibus-description";
import { VoteCall } from "../../src/omnibuses/omnibus-types";

const GOVERNANCE = "0xC1db28B3301331277e307FDCfF8DE28242A4486E";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";

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

function createDirectCall(title: string): VoteCall {
  return { title, target: AGENT, payload: "0x11223344" };
}

function createDescriptionFile(body: string): string {
  return [
    "# Omnibus",
    "",
    "## Dual Governance Proposal Descriptions",
    "",
    "<!-- DG_PROPOSAL_DESCRIPTIONS -->",
    body,
    "<!-- DG_PROPOSAL_DESCRIPTIONS -->",
    "",
  ].join("\n");
}

describe("vote description", () => {
  it("numbers the items and joins them the way the vote description does", () => {
    const description = formatVoteDescription(["Transfer 110,000 LDO to ATC multisig", "Add EVM script factory"]);

    assert.equal(description, "Omnibus vote: 1. Transfer 110,000 LDO to ATC multisig;\n 2. Add EVM script factory.");
  });

  it("appends the description link on a separate line", () => {
    const description = formatVoteDescription(["Single item"], "https://example.org/description");

    assert.equal(description, "Omnibus vote: 1. Single item.\nhttps://example.org/description");
  });

  it("rejects a title carrying the number of the item", () => {
    assert.throws(() => formatVoteDescription(["1. Numbered item"]), /starts with its number/);
    assert.throws(() => formatVoteDescription(["Fine item", "2) Numbered item"]), /starts with its number/);
  });

  it("rejects an empty title", () => {
    assert.throws(() => formatVoteDescription(["Fine item", "   "]), /empty title/);
  });

  it("rejects repeating titles, which make log groups ambiguous", () => {
    assert.throws(() => formatVoteDescription(["Same item", "Same item"]), /repeating titles/);
  });
});

describe("dual governance proposal descriptions", () => {
  describe("parseDgProposalDescriptions", () => {
    it("returns nothing when the file has no such section", () => {
      assert.equal(parseDgProposalDescriptions("# Omnibus\n\nNo proposals here\n").size, 0);
    });

    it("reads an entry per item, keeping the text as written", () => {
      const markdown = createDescriptionFile(
        [
          "",
          "### Item 2",
          "",
          "```text",
          "Proposal  description, kept  as  written.",
          "```",
          "",
          "### Item 5",
          "",
          "```",
          "First line",
          "Second line",
          "```",
          "",
        ].join("\n"),
      );

      const descriptions = parseDgProposalDescriptions(markdown);

      assert.deepEqual(
        [...descriptions.entries()],
        [
          [2, "Proposal  description, kept  as  written."],
          [5, "First line\nSecond line"],
        ],
      );
    });

    it("fails on a fenced block without a heading above it", () => {
      const markdown = createDescriptionFile(["", "```text", "Orphan description", "```", ""].join("\n"));

      assert.throws(() => parseDgProposalDescriptions(markdown), /without a "### Item N" heading/);
    });

    it("fails on a heading without a fenced block", () => {
      const markdown = createDescriptionFile(["", "### Item 2", "", "Description as plain text", ""].join("\n"));

      assert.throws(() => parseDgProposalDescriptions(markdown), /no fenced block/);
    });

    it("fails on two descriptions for the same item", () => {
      const markdown = createDescriptionFile(
        ["", "### Item 2", "```text", "First", "```", "### Item 2", "```text", "Second", "```", ""].join("\n"),
      );

      assert.throws(() => parseDgProposalDescriptions(markdown), /more than one proposal description/);
    });

    it("fails on an unexpected heading inside the section", () => {
      const markdown = createDescriptionFile(["", "### Notes", "", ""].join("\n"));

      assert.throws(() => parseDgProposalDescriptions(markdown), /Unexpected heading/);
    });

    it("fails when the section is not closed", () => {
      const markdown = ["<!-- DG_PROPOSAL_DESCRIPTIONS -->", "### Item 1", "```text", "Description", "```"].join("\n");

      assert.throws(() => parseDgProposalDescriptions(markdown), /is not closed/);
    });
  });

  describe("assertDgProposalDescriptions", () => {
    const calls = [createDirectCall("Transfer LDO"), createSubmitProposalCall("Proposal description")];
    const markdown = createDescriptionFile(
      ["", "### Item 2", "", "```text", "Proposal description", "```", ""].join("\n"),
    );

    it("passes when the contract carries the description from the file", () => {
      assertDgProposalDescriptions(calls, GOVERNANCE, markdown);
    });

    it("passes when the vote submits no proposals and the file has no section", () => {
      assertDgProposalDescriptions([createDirectCall("Transfer LDO")], GOVERNANCE, "# Omnibus\n");
    });

    it("fails when the text differs, even by a character", () => {
      const tidiedUp = createDescriptionFile(
        ["", "### Item 2", "", "```text", "Proposal description.", "```", ""].join("\n"),
      );

      assert.throws(() => assertDgProposalDescriptions(calls, GOVERNANCE, tidiedUp), /differs from the one/);
    });

    it("fails when the submitting item has no entry in the file", () => {
      assert.throws(() => assertDgProposalDescriptions(calls, GOVERNANCE, "# Omnibus\n"), /has no\s+"### Item 2"/);
    });

    it("fails when the entry points at an item submitting nothing", () => {
      const wrongItem = createDescriptionFile(
        ["", "### Item 1", "", "```text", "Proposal description", "```", ""].join("\n"),
      );

      assert.throws(() => assertDgProposalDescriptions(calls, GOVERNANCE, wrongItem), /submit no Dual Governance/);
    });
  });
});
