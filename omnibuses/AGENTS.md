# Omnibus Conventions

Rules for creating, modifying, and reviewing omnibuses.

## Source of truth

Full guide: `docs/omnibuses/WRITING_OMNIBUS.md`

## Canonical examples

- `_omnibus_template/_omnibus_template.ts` — empty template
- `_example_regular_omnibus/_example_regular_omnibus.ts` — full regular omnibus
- `_example_contract_omnibus/_example_contract_omnibus.ts` — omnibus with Solidity contract
- `2025_09_01/2025_09_01.ts` — real production omnibus

## Quick flow

1. `npm run omnibus:create` — scaffold from template
2. Fill `omnibuses/<name>/<name>.md` inside `<!-- OMNIBUS_DESCRIPTION -->`
3. Implement calls in `<name>.ts`
4. Contract mode (opt-in, only on explicit request):
   - `npm run omnibus:contract -- <name>`
   - `npm run omnibus:build -- <name>`
   - Normalize generated `.sol`: replace inline literals with named constants
   - Add `deploy()` returning `omnibus` in `.ts`

## Key rules

1. Prefer blueprint calls (`blueprints.tokens.transfer`, `blueprints.easyTrack.*`) over custom `directCall`
2. Keep titles numbered: `"1. Do thing"`, `"2. Do other thing"`
3. Keep event expectations complete and deterministic
4. `voteId/launchedAt/executedAt/quorumReached` = `undefined` until real launch

## Permission model

Determine BEFORE writing calls or tests:

- **OZ AccessControl** → `grantRole/revokeRole/hasRole`
- **Aragon ACL** → `grantPermission/revokePermission/hasPermission`
- **Lido** (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) is Aragon ACL-managed. Never use OZ methods for Lido.
- In tests use `checks.accessControl.*` helpers

## Testing

- Cover each call item with functional assertions
- Enforce four state phases: before vote, after vote, before DG, after DG
- Use `checks.*` helpers (`checks.tokens`, `checks.easyTrack`, `checks.stakingRouter`, `checks.accessControl`)

## Validation before launch

```bash
npx tsc --noEmit omnibuses/<name>/<name>.ts
npm run omnibus:test -- <name>
npm run omnibus:simulate -- <name>
```
