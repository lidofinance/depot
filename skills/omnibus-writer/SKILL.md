---
name: omnibus-writer
description: Create and update omnibus files in this repository, including date-based omnibus scaffolding, contracts/calls/test sections, expected event definitions, vote metadata lifecycle, and runbook commands. Use when asked to write a new omnibus, modify an existing omnibus, prepare omnibus tests, or review omnibus correctness before launch.
---

# Omnibus Writer

Use this skill to author and maintain omnibuses in this repository.

## Workflow

1. Read the source-of-truth guide first: `docs/omnibuses/WRITING_OMNIBUS.md`.
2. Pick the correct pattern:
   - regular omnibus: `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
   - contract omnibus: `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
3. Scaffold a new omnibus when requested:
   - `npm run omnibus:create`
   - or `skills/omnibus-writer/scripts/scaffold_omnibus.sh <name> [mainnet|holesky]`
4. Ask user to write free-form description in `omnibuses/<name>/<name>.md` inside:
   - `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`
5. Transform this description into concrete omnibus calls in `<name>.ts`.
6. Implement the omnibus `.ts`:
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
7. Contract mode is opt-in only:
   - do not generate contract by default
   - generate contract only after explicit user request
8. If contract mode is required, generate contract file:
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
9. Keep metadata lifecycle strict:
   - set `voteId/launchedAt/executedAt/quorumReached` only after real lifecycle milestones
10. Validate with runbook commands before launch:
   - `npx tsc --noEmit omnibuses/<name>/<name>.ts`
   - `npm run omnibus:test -- <name>`
   - `npm run omnibus:simulate -- <name>`
   - `npm run omnibus:run -- <name>`
11. For contract mode, compilation after generation is mandatory:
   - `npm run omnibus:build -- <name>`

## References

- Compact checklist: `skills/omnibus-writer/references/workflow.md`
- Template: `omnibuses/_omnibus_template/_omnibus_template.ts`
- Real completed sample: `omnibuses/2025_09_01/2025_09_01.ts`

## Constraints

- Prefer blueprints over custom low-level calls when equivalent blueprint exists.
- Ensure each action has explicit title and deterministic event expectations.
- Do not auto-fill post-launch metadata on newly created omnibuses.
- Read description only from `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`.
- Treat contract generation output as draft and perform manual normalization.
