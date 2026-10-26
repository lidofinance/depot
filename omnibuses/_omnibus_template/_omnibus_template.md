# Omnibus "Omnibus Template"

## Omnibus Description

Number the vote items the way they must appear in the vote, and nest the calls of a Dual Governance
proposal under the item that submits it. Ordering is part of the payload, so write it as an
instruction rather than as prose. Name every address, amount, and limit explicitly — the author of
the vote is the only source for them. Every numbered item is exactly one call; if several calls
must go through the Aragon Agent as one forward, list them under a single item and say so.

<!-- OMNIBUS_DESCRIPTION -->

1. First vote item
2. Second vote item, submitting a Dual Governance proposal with the following calls in this order:

   2.1. First call of the proposal
   2.2. Second call of the proposal

<!-- OMNIBUS_DESCRIPTION -->

## Dual Governance Proposal Descriptions

One entry per Dual Governance proposal submitted above, in a fenced block, headed by the number of
the vote item that submits it.

The text inside the fence is the `metadata` argument of `submitProposal` and reaches the payload
character for character, so it is copied as written — no rewrapping, no punctuation fixes, no
heading prefix. Keep each description on a single line unless a line break genuinely belongs in it.

Omit this section entirely when the vote submits no Dual Governance proposal.

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 2

```text
The description of the proposal, exactly as it goes on-chain
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->
