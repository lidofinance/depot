---
name: omnibus-writer
description: Create and update omnibus files in this repository, including date-based omnibus creation, contracts/calls/test sections, expected event definitions, vote metadata lifecycle, and runbook commands. Use when asked to write a new omnibus, modify an existing omnibus, prepare omnibus tests, or review omnibus correctness before launch.
---

# Omnibus Writer

Use this skill to author and maintain omnibuses in this repository.

## Workflow

1. Read the source-of-truth guide first: `docs/omnibuses/WRITING_OMNIBUS.md`.
2. Pick the correct pattern:
   - regular omnibus: `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
   - contract omnibus: `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
3. Create a new omnibus when requested:
   - `npm run omnibus:create`
   - or `.agents/skills/omnibus-writer/scripts/create_omnibus.sh <name> [mainnet|holesky]`
4. Ask user to write free-form description in `omnibuses/<name>/<name>.md` inside:
   - `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`
5. Transform this description into concrete omnibus calls in `<name>.ts`.
6. Run a pre-flight gap check BEFORE writing any calls (see "Missing inputs — stop and ask"):
   - identify every missing or ambiguous input: constants/values, ABIs, blueprints, utils, and the execution path/authority for each call
   - escalate them all to the user in ONE consolidated request
   - proceed only after the user answers
7. Implement the omnibus `.ts`:
   - identify access-control model per target contract before coding calls
   - for Lido (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) use Aragon ACL methods on ACL proxy:
     - `grantPermission/revokePermission/hasPermission`
   - do not use OZ `grantRole/revokeRole/hasRole` for Lido permissions
   - declare required contracts in `createContracts(...)`
   - implement numbered `calls`
   - include complete `event(...)` checks
   - implement `testVote` and `testProposal` where applicable
   - cover each call item with assertions
   - use `checks.*` helpers first, custom checks second
   - for permission checks use `checks.accessControl.*` helpers
   - validate state before/after vote and before/after DG
   - validate functional effects, not only events
8. Contract mode is opt-in only:
   - do not generate contract by default
   - generate contract only after explicit user request
9. If contract mode is required, generate contract file:
   - `npm run omnibus:contract -- <name>`
   - immediately compile generated contract:
     - `npm run omnibus:build -- <name>`
   - then add/verify `deploy()` in omnibus `.ts` returning `omnibus` (or explicit `deployment: createContracts({...})`) so runtime uses generated contract
   - normalize generated `.sol`:
     - replace inline role/address literals in calls with named constants
     - reuse the same constant names as in omnibus `<name>.ts` when possible
   - compile again after normalization:
     - `npm run omnibus:build -- <name>`
   - then manually review naming, role constants, permission bytes, addresses, and call ordering
10. Keep metadata lifecycle strict:
   - set `voteId/launchedAt/executedAt/quorumReached` only after real lifecycle milestones
11. Validate with runbook commands before launch:

- `npx tsc --noEmit omnibuses/<name>/<name>.ts`
- `npm run omnibus:test -- <name>`
- `npm run omnibus:trace -- <name>`
- `npm run omnibus:launch -- <name>`

12. For contract mode, compilation after generation is mandatory:

- `npm run omnibus:build -- <name>`

## References

- Compact checklist: `.agents/skills/omnibus-writer/references/workflow.md`
- Template: `omnibuses/_omnibus_template/_omnibus_template.ts`

## Constraints

- Prefer blueprints over custom low-level calls when equivalent blueprint exists.
- Ensure each action has explicit title and deterministic event expectations.
- Do not auto-fill post-launch metadata on newly created omnibuses.
- Read description only from `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`.
- Treat contract generation output as draft and perform manual normalization.
- When any required input is missing or ambiguous, STOP and ask the user — never self-source it via on-chain reads, block explorers, or other repositories, and never guess. See "Missing inputs" below.

## Missing inputs — stop and ask (never guess, never self-source)

An omnibus encodes protocol-level authority and value changes; a wrong address, ABI, encoding, or execution path is a critical defect. Whenever an input needed to author or test the omnibus is missing or ambiguous, STOP and ask the user. Do NOT fill the gap by reading on-chain state, a block explorer, or any legacy/other repository, and do NOT invent a plausible value. Providing missing data is the user's responsibility; surfacing the gap precisely is yours.

Before writing calls, run a pre-flight gap check and escalate ALL findings in ONE consolidated request, grouped by type:

- **Missing constant/value** — address, amount, timestamp, decimals/units convention, or any value that must be preserved (e.g. a `fastLaneLengthSlots`-style field in a partial config setter). Name each and where it is used; ask for the exact value.
- **Missing ABI** — name the exact contract(s) whose ABI is absent from `abi/`; ask the user to provide it or point to a source. Never fabricate or scrape an ABI.
- **Missing blueprint** — if an action is a recurring Lido pattern with no equivalent blueprint, propose the blueprint namespace/name + signature and ask the user to confirm before adding it.
- **Missing util/helper** — name the helper and what it must do; ask.
- **Authority / execution path** — for each call, decide whether it is a direct call, an `Agent.forward`, or wrapped in a Dual Governance submission, and state WHY (which entity holds the permission / role admin / permission manager). If you cannot determine the authority from the provided inputs, state your assumption and ask the user to confirm — do not read it from chain.
- **Any other uncertainty** — ask rather than assume.

Proceed to implementation only after the user has answered.

Carve-out: reading chain state inside `testVote`/`testProposal` against a fork pinned to a pre-vote block is expected and allowed. The ban above targets sourcing authoring inputs (addresses, values, ABIs, authority model) off-chain-of-spec — not runtime test assertions.
