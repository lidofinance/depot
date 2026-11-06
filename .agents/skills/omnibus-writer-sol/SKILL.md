---
name: omnibus-writer-sol
description: Write or update a Lido omnibus from a Markdown vote description as a Solidity contract and a TypeScript fork test. Use when authoring an omnibus or its fork tests.
---

# Omnibus Writer (Solidity-first)

Turn the author's description into a Solidity payload and a TypeScript test of its effects. Solidity owns the calls; TypeScript owns deployment and assertions. Use the [writing guide](../../../docs/omnibuses/WRITING_OMNIBUS.md) for the file layout, metadata rules and runbook. Consult [HELPERS.md](HELPERS.md) when choosing a domain helper or its event/check pair.

## Inventory before implementation

Read the `OMNIBUS_DESCRIPTION` block and any `DG_PROPOSAL_DESCRIPTIONS` entries in the vote Markdown. If the author supplied the description separately, put that text into the scaffold. Inventory each action's target, caller, exact typed arguments, units, order and grouping using the description and repository.

Resolve payload-changing gaps before writing calls:

- Addresses must come from the description or established repository context, not memory. If an explicit historical address differs from a current registry, resolve which deployment the author intends; keep the chosen address vote-local.
- Find the exact interface method and role identifier. A missing quorum, limit, mode number or permission parameter is a missing argument, not a default to invent.
- Distinguish Voting, the DG executor and Agent authority, and Aragon ACL from OpenZeppelin AccessControl. A successful compile does not establish permission to call a target.
- Every submitting vote item needs its own exact fenced DG description. The title of the submitting item is not a substitute for that metadata.
- Preserve one call per numbered item at its parent level. Combine calls into one Agent forward only when the description groups them that way.

Ask the author whether the vote contains a protocol upgrade and record the answer as `upgrade` in the wrapper; never infer it from the payload. `upgrade: true` makes `omnibus:test` run every upgrade snapshot suite; there is nothing to select or declare. Assert the vote's intended upgrade effects, such as new implementation addresses, in `testVote`/`testProposal`.

Report unresolved inputs by item and ask for the information that changes the payload. Do not close such a gap by an external lookup or an assumption; implementation starts only after the author resolves it. Continue directly when they are resolved; existing authorization to obtain an ABI or implement an agreed action remains valid. Prior state omitted from the description is separate: read it on the intended fork and assert the strongest supported before/after relation instead of inventing a historical value.

If an action lacks an appropriate call/event helper or the exact contract interface, report the gap by item, propose how to cover it, and wait for the author's agreement before adding a helper/interface or bypassing it with a direct call, generic event expectation or manual encoding. An already authorized ABI fetch or agreed implementation satisfies this gate; continue within that scope without asking again.

## Implement

1. For a new omnibus, use `npm run omnibus:create`; it places the vote in `omnibuses/ongoing/<network>/<name>`. Fill the four scaffold files; draft `<name>.ipfs.md` as the public vote text, which launch publishes verbatim. For an existing omnibus, update only the requested actions; only `voteId` and `deployment` are recorded in the wrapper, nothing else.
2. Implement `getOmnibusCalls()` in the Solidity contract with typed interfaces and the appropriate builders. Keep the payload deterministic, with exact call counts and vote-local address/role/metadata constants. Follow the guide's address and title rules.
3. Reuse the checked-in ABI/interface for the intended deployment version. If one is missing or stale, follow [ABI sync](../../../docs/ABI_SYNC.md) for that contract only. Record its source and generation options; do not overwrite unrelated interfaces or regenerate historical inputs from an unexamined latest deployment.
4. Write `testVote` and, for submitted proposals, `testProposal` in the wrapper. Use the existing template and [examples catalogue](../../../docs/omnibuses/README.md). The wrapper has no `calls` option or TS blueprint/generator stage.

Author per-vote fork tests in TypeScript. Solidity `.t.sol` files test reusable Solidity code; they are not a replacement for the omnibus runtime's state and receipt checks.

## Assert the effects

- Capture before-state, call `passOmnibus()`, and check the effects of every vote item. Read public expected constants from `deployment.omnibus` through a typed ABI, as in the tiny example. Keep assertions independently tied to the description: reading a changed target's value back is not an expected value.
- Register each item's domain events with `voteEvents.item(title, events)`. A DG submission with no additional domain events still needs `voteEvents.item(title)`. The helper supplies the Voting/DG envelopes.
- In `testProposal`, call `passProposals()` and register every returned proposal's calls by zero-based index. If executing subsets in stages, all submitted IDs must be covered before the callback returns; the returned arrays follow the requested ID order. An empty list does not complete pending proposals.
- Preserve event groups inside Agent forwards; the catalogue shows flat versus nested arrays. The runtime checks structural/tail events and rejects leftover logs. Optional or repeated expectations must reflect the target's actual behavior, not hide an unexplained receipt.
- Verify functional permissions where the action grants a specific capability: the intended caller and arguments work, a relevant disallowed caller/argument fails. Use an inner snapshot only when the probe changes state needed by later assertions; larger protocol scenarios belong in the owning repository's suite.
- For time-dependent calls, arrange execution inside the intended window and test the relevant rejected boundary. Account for governance delays when choosing that time.

The runtime snapshots before `testVote` and restores after both callbacks, including on failure. State changes can persist from `testVote` into `testProposal`; impersonation cleanup alone does not restore balances. Use that existing lifecycle before adding extra restoration.

## Verify and report

Run the guide's Solidity formatting, build, address-lint, TypeScript and fork checks within the user's authorized scope. `Omnibus.test()` picks its checks by the on-chain state of `voteId` (guide section 4); write `testFinalState` so an executed vote is still checked. Inspect an executed vote through `omnibus:trace`; only `voteId` and `deployment` are recorded, nothing else.

Report the network/block, commands, results, saved payload hash, source/deployment assumptions, and before-state that the description did not pin down. Distinguish build/type checks, local models, fork execution and external-repository acceptance; a skipped test is not a passed test.

When authoring from a description, derive the payload from that description and verified contract interfaces. Fetching the target's ABI differs from copying another implementation of the vote. Perform an independent comparison to an existing vote's script when that verification is requested; do not use it to fill unspecified payload inputs silently.

Never run `--broadcast` deploy or launch against Mainnet/Hoodi and never read keystore contents: a human performs real operations through the CLI. A local rehearsal (no `--broadcast`) uses a local dev node, selects a keystore account without unlocking it and skips the IPFS upload; `--broadcast` needs typed network-name confirmation. A successful local rehearsal does not establish public deployment or lifecycle facts. Before handing over for a `--broadcast` launch, ask the author to approve the `<name>.ipfs.md` text.
