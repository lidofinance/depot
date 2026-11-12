import { assert } from "chai";
import { encodeFunctionData } from "viem";

import { IGovernance_ABI } from "@/abi/IGovernance.abi";
import {
  assertDgProposalDescriptions,
  formatVoteDescription,
  parseDgProposalDescriptions,
} from "@/src/omnibuses/omnibus-description";
import { VoteCall } from "@/src/omnibuses/omnibus-types";

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
});

describe("dual governance proposal descriptions", () => {
  describe("parseDgProposalDescriptions", () => {
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

    it("preserves internal CRLF and whitespace in a multiline description", () => {
      const markdown = createDescriptionFile("### Item 1\n```text\n First line\nSecond line  \n```\n").replaceAll(
        "\n",
        "\r\n",
      );
      const metadata = " First line\r\nSecond line  ";

      assert.equal(parseDgProposalDescriptions(markdown).get(1), metadata);
      assertDgProposalDescriptions([createSubmitProposalCall(metadata)], GOVERNANCE, markdown);
      assert.throws(
        () =>
          assertDgProposalDescriptions(
            [createSubmitProposalCall(metadata.replace("\r\n", "\n"))],
            GOVERNANCE,
            markdown,
          ),
        /differs from the one/,
      );
      assert.throws(
        () => assertDgProposalDescriptions([createSubmitProposalCall(metadata.trimEnd())], GOVERNANCE, markdown),
        /differs from the one/,
      );
    });
  });

  describe("assertDgProposalDescriptions", () => {
    const calls = [createDirectCall("Transfer LDO"), createSubmitProposalCall("Proposal description")];

    it("fails when the submitting item has no entry in the file", () => {
      assert.throws(() => assertDgProposalDescriptions(calls, GOVERNANCE, "# Omnibus\n"), /has no\s+"### Item 2"/);
    });
  });
});
