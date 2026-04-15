# Repository Agent Instructions

## Purpose

Use these instructions when working with omnibuses in this repository.

## Source of truth

1. Human documentation:
   - `docs/omnibuses/README.md`
   - `docs/omnibuses/WRITING_OMNIBUS.md`
2. Canonical code examples:
   - `omnibuses/_omnibus_template/_omnibus_template.ts`
   - `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
   - `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
   - `omnibuses/2025_09_01/2025_09_01.ts`
3. Skill package:
   - `skills/omnibus-writer/SKILL.md`

## Trigger

Apply the `omnibus-writer` skill for requests about:

- creating a new omnibus
- modifying omnibus calls/contracts/tests
- reviewing omnibus correctness
- preparing omnibus runbook for launch

## Working rules

1. Prefer blueprint-based calls when available.
2. Keep event expectations complete and deterministic.
3. Do not fill `voteId/launchedAt/executedAt/quorumReached` before real launch milestones.
4. Keep omnibus markdown sections present:
   - `<!-- OMNIBUS_DESCRIPTION -->`
5. In tests, cover each call item and functional outcomes.
6. In tests, enforce four state phases: before vote, after vote, before DG, after DG.
7. Use `checks.*` helpers first when equivalent checks already exist.
8. Treat generated Solidity contract as draft; manually normalize naming, role constants, and permissions.
9. Determine permission model before writing calls/tests:
   - OZ AccessControl => `grantRole/revokeRole/hasRole`
   - Aragon ACL => `grantPermission/revokePermission/hasPermission`
   - Lido (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) is Aragon ACL-managed; never use OZ AccessControl methods for Lido permissions.
   - In tests, use `checks.accessControl.*` helpers for permission assertions.
10. Validate before launch with:
   - `npx tsc --noEmit omnibuses/<name>/<name>.ts`
   - `npm run omnibus:test -- <name>`
   - `npm run omnibus:simulate -- <name>`
11. For contract mode, always compile generated `.sol` immediately after generation:
   - `npm run omnibus:build -- <name>`
12. Never generate contract files implicitly. Run `npm run omnibus:contract -- <name>` only after explicit user request (for example: "сгенерируй контракт омнибус").
13. If contract mode is requested, add/verify `deploy()` in omnibus `.ts` (returning `omnibus`) or explicit `deployment: createContracts({...})` after successful contract generation/compilation, so contract mode is actually used by omnibus runtime.
14. After contract generation, agent must normalize generated `.sol`:
   - replace inline role/address literals in calls with named constants
   - use the same constant names as in omnibus `<name>.ts` where applicable
   - re-run `npm run omnibus:build -- <name>` after normalization

## Agent command flow

When user says `omnibus create`, run this sequence:

1. `npm run omnibus:create`
2. Ask user to fill `omnibuses/<name>/<name>.md` inside `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`.
3. Transform that free-form description into concrete omnibus calls in `<name>.ts`.
4. Clarify if Solidity contract is required, and if yes run `npm run omnibus:contract -- <name>`.
