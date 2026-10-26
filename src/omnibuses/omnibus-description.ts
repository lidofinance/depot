import { Address } from "abitype";

import { decodeSubmitProposalMetadata, getSubmitProposalCallIndexes } from "./omnibus-contract-calls";
import { VoteCall } from "./omnibus-types";

const DG_DESCRIPTIONS_MARKER = "<!-- DG_PROPOSAL_DESCRIPTIONS -->";
const ITEM_HEADING_PATTERN = /^###\s+Item\s+(\d+)\s*$/;
const FENCE_PATTERN = /^```/;
const NUMBERED_TITLE_PATTERN = /^\s*\d+\s*(?:\.(?!\d)|\))/;

/**
 * Builds the description of the Aragon vote out of the titles of its items, in the shape the
 * `scripts` repository produced. The numbers are added here rather than written by the author: a
 * number baked into a title goes stale as soon as an item is inserted in the middle.
 */
export function formatVoteDescription(itemTitles: string[], ipfsLink?: string): string {
  itemTitles.forEach((title, index) => {
    if (title.trim() === "") {
      throw new Error(`Vote item ${index + 1} has an empty title`);
    }
    if (NUMBERED_TITLE_PATTERN.test(title)) {
      throw new Error(
        `Title of the vote item ${index + 1} starts with its number: "${title}". ` +
          `Items are numbered when the description is built, so the title must carry the text only.`,
      );
    }
  });

  const duplicatedTitle = itemTitles.find((title, index) => itemTitles.indexOf(title) !== index);
  if (duplicatedTitle !== undefined) {
    throw new Error(`Vote items have repeating titles: "${duplicatedTitle}"`);
  }

  const numberedTitles = itemTitles.map((title, index) => `${index + 1}. ${title}`);
  const description = `Omnibus vote: ${numberedTitles.join(";\n ")}.`;

  return ipfsLink ? `${description}\n${ipfsLink}` : description;
}

/**
 * Reads the proposal descriptions from the omnibus Markdown file, where each entry is a fenced block
 * headed by the number of the vote item submitting the proposal.
 *
 * @returns descriptions by the number of the submitting item, empty when the file has no such section
 */
export function parseDgProposalDescriptions(markdown: string): Map<number, string> {
  const descriptions = new Map<number, string>();

  const sectionStart = markdown.indexOf(DG_DESCRIPTIONS_MARKER);
  if (sectionStart === -1) {
    return descriptions;
  }

  const contentStart = sectionStart + DG_DESCRIPTIONS_MARKER.length;
  const sectionEnd = markdown.indexOf(DG_DESCRIPTIONS_MARKER, contentStart);
  if (sectionEnd === -1) {
    throw new Error(`Section "${DG_DESCRIPTIONS_MARKER}" is not closed`);
  }

  const lines = markdown.slice(contentStart, sectionEnd).split("\n");

  let itemNumber: number | null = null;
  let fencedLines: string[] | null = null;

  for (const line of lines) {
    if (fencedLines) {
      if (FENCE_PATTERN.test(line)) {
        if (itemNumber === null) {
          throw new Error(`Internal error: fenced block without an item number`);
        }
        // The final CR belongs to the closing fence's CRLF delimiter.
        descriptions.set(itemNumber, fencedLines.join("\n").replace(/\r$/, ""));
        itemNumber = null;
        fencedLines = null;
      } else {
        fencedLines.push(line);
      }
      continue;
    }

    const headingMatch = line.match(ITEM_HEADING_PATTERN);
    if (headingMatch) {
      if (itemNumber !== null) {
        throw new Error(`Vote item ${itemNumber} has a heading but no fenced block with the description`);
      }
      itemNumber = Number(headingMatch[1]);
      if (descriptions.has(itemNumber)) {
        throw new Error(`Vote item ${itemNumber} has more than one proposal description`);
      }
      continue;
    }

    if (FENCE_PATTERN.test(line)) {
      if (itemNumber === null) {
        throw new Error(`Fenced block without a "### Item N" heading above it`);
      }
      fencedLines = [];
      continue;
    }

    if (line.trim() !== "" && line.startsWith("#")) {
      throw new Error(`Unexpected heading in the proposal descriptions section: "${line.trim()}"`);
    }
  }

  if (fencedLines) {
    throw new Error(`Fenced block of the vote item ${itemNumber} is not closed`);
  }
  if (itemNumber !== null) {
    throw new Error(`Vote item ${itemNumber} has a heading but no fenced block with the description`);
  }

  return descriptions;
}

/**
 * Compares the proposal descriptions in the contract with the ones in the Markdown file, character
 * for character. They are arguments of `submitProposal`, so tidying one up on the way to the contract
 * changes what the DAO votes on, and nothing else would notice.
 */
export function assertDgProposalDescriptions(calls: VoteCall[], governance: Address, markdown: string): void {
  const descriptions = parseDgProposalDescriptions(markdown);
  const submittingItemNumbers = getSubmitProposalCallIndexes(calls, governance).map((index) => index + 1);

  const describedItemNumbers = [...descriptions.keys()].sort((left, right) => left - right);
  const notSubmitting = describedItemNumbers.filter((itemNumber) => !submittingItemNumbers.includes(itemNumber));
  if (notSubmitting.length > 0) {
    throw new Error(
      `Proposal descriptions are given for vote items [${notSubmitting}], which submit no Dual Governance proposal. ` +
        `Items submitting proposals: [${submittingItemNumbers}]`,
    );
  }

  for (const itemNumber of submittingItemNumbers) {
    const call = calls[itemNumber - 1];
    const description = descriptions.get(itemNumber);

    if (description === undefined) {
      throw new Error(
        `Vote item ${itemNumber} submits a Dual Governance proposal, but the description file has no ` +
          `"### Item ${itemNumber}" entry for it`,
      );
    }

    const metadata = decodeSubmitProposalMetadata(call);
    if (metadata !== description) {
      throw new Error(
        `Description of the proposal submitted by the vote item ${itemNumber} differs from the one in the ` +
          `description file:\n  contract: ${JSON.stringify(metadata)}\n  file:     ${JSON.stringify(description)}`,
      );
    }
  }
}
