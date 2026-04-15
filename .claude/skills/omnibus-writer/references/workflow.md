# Omnibus Writing Workflow (Reference)

This reference is a compact checklist for the `omnibus-writer` skill.
The source of truth remains `docs/omnibuses/WRITING_OMNIBUS.md`.

## Checklist

1. Create new folder in `omnibuses/` with date-based name.
2. Run `npm run omnibus:create` (or use create script) to create template files.
3. Put free-form requirements into `omnibuses/<name>/<name>.md` inside `<!-- OMNIBUS_DESCRIPTION -->`.
4. Transform this description into concrete `calls` items in `<name>.ts`.
5. Determine access-control model per target:
   - OZ AccessControl => `grantRole/revokeRole/hasRole`
   - Aragon ACL => `grantPermission/revokePermission/hasPermission`
   - Lido `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` is Aragon ACL-managed.
6. Dedicated Solidity contract is opt-in; do not generate it unless user explicitly asks.
7. If user explicitly requested contract mode, run `npm run omnibus:contract -- <name>`.
8. Immediately compile generated contract: `npm run omnibus:build -- <name>`.
9. Then add/verify `deploy()` in omnibus `.ts` returning `omnibus` (or explicit `deployment` mapping), so runtime uses generated contract.
10. Normalize generated `.sol`: replace inline role/address literals with constants, reusing names from `<name>.ts` where possible.
11. Compile again after normalization: `npm run omnibus:build -- <name>`.
12. Fill `createContracts(...)` only with required contracts.
13. Implement `calls` with numbered titles and complete `event(...)` checks.
14. Add `deploy()` only when validator/contract deployment is required.
15. Implement `testVote` and `testProposal` (if proposals are submitted).
16. Ensure tests cover each call item and functional behavior.
17. Check state at four phases: before vote, after vote, before DG, after DG.
18. Prefer `checks.*` helpers in tests wherever available.
    - For permissions use `checks.accessControl.*`.
19. If contract was generated, manually review naming/constants/roles/permissions.
20. Keep `voteId/launchedAt/executedAt/quorumReached` as `undefined` before real launch.
21. Run:

- `npx tsc --noEmit omnibuses/<name>/<name>.ts`
- `npm run omnibus:test -- <name>`
- `npm run omnibus:trace -- <name>`

22. Only then run: `npm run omnibus:launch -- <name>`.
23. After launch, backfill vote metadata fields.

## Canonical examples

- `omnibuses/_omnibus_template/_omnibus_template.ts`
- `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
- `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
