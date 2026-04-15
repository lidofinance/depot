# Claude Agent Instructions

## Scope

When the task involves writing or updating omnibuses, follow this workflow.

## Primary guide

Read and follow:

- `docs/omnibuses/WRITING_OMNIBUS.md`

Use these examples as canonical patterns:

- `omnibuses/_omnibus_template/_omnibus_template.ts`
- `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
- `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
- `omnibuses/2025_09_01/2025_09_01.ts`

## Required behavior

1. Prefer blueprint calls over custom calls where possible.
2. Keep titles numbered and expected events explicit.
3. Keep `voteId/launchedAt/executedAt/quorumReached` as `undefined` until real lifecycle milestones are known.
4. Keep omnibus markdown markers intact:
   - `<!-- OMNIBUS_DESCRIPTION -->`
5. In tests, cover each call item with functional assertions.
6. In tests, enforce state checks before/after vote and before/after DG.
7. Prefer existing `checks.*` helpers over ad-hoc checks when available.
8. Treat generated Solidity contract as draft and manually normalize naming/roles/permissions.
9. Determine permission model before writing calls/tests:
   - OZ AccessControl => `grantRole/revokeRole/hasRole`
   - Aragon ACL => `grantPermission/revokePermission/hasPermission`
   - Lido (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) is Aragon ACL-managed; never use OZ AccessControl methods for Lido permissions.
   - In tests, use `checks.accessControl.*` helpers for permission assertions.
10. Before proposing launch, require:
   - `npx tsc --noEmit omnibuses/<name>/<name>.ts`
   - `npm run omnibus:test -- <name>`
   - `npm run omnibus:simulate -- <name>`
11. For contract mode, always compile generated `.sol` right after generation:
   - `npm run omnibus:build -- <name>`
12. Never generate contract files by default. Run `npm run omnibus:contract -- <name>` only after explicit user request.
13. In contract mode, add/verify `deploy()` that returns `omnibus` contract (or explicit `deployment`) after successful contract generation/compilation, so omnibus runtime uses the contract.
14. After contract generation, normalize generated `.sol`:
   - replace inline role/address literals in calls with named constants
   - align constant names with omnibus `<name>.ts`
   - compile again after normalization (`npm run omnibus:build -- <name>`)

## Optional create command

Use:

`skills/omnibus-writer/scripts/create_omnibus.sh <YYYY_MM_DD[_topic]> [mainnet|holesky]`

## Agent-style quick flow

If user starts with `omnibus create`, follow:

1. `npm run omnibus:create`
2. Ask user to provide free-form description in `omnibuses/<name>/<name>.md` inside `<!-- OMNIBUS_DESCRIPTION -->`.
3. Transform description into concrete calls in `<name>.ts`.
4. Ask whether Solidity contract is needed.
5. If contract mode is enabled, run `npm run omnibus:contract -- <name>`.
