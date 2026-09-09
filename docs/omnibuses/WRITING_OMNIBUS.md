# How To Write an Omnibus

This guide describes the practical workflow for creating omnibuses in this repository.

Source examples used in this guide:

- Template: [../../omnibuses/\_omnibus_template/\_omnibus_template.ts](../../omnibuses/_omnibus_template/_omnibus_template.ts)
- Regular omnibus: [../../omnibuses/\_example_regular_omnibus/\_example_regular_omnibus.ts](../../omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts)
- Contract omnibus: [../../omnibuses/\_example_contract_omnibus/\_example_contract_omnibus.ts](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts)
- Completed real omnibus: [../../omnibuses/2025_09_01/2025_09_01.ts](../../omnibuses/2025_09_01/2025_09_01.ts)

## 1. Choose omnibus type

Use one of two patterns:

1. Regular omnibus (most cases)
   - No dedicated on-chain `OmnibusBase` contract.
   - Follow the structure from `_example_regular_omnibus`.
2. Contract omnibus (when vote logic must live in a dedicated contract)
   - Deploy and use `omnibus` contract in `deploy()`.
   - Follow the structure from `_example_contract_omnibus`.

## 2. Create a new folder and files

Create a folder in `omnibuses/` with date-based name, usually `YYYY_MM_DD` or `YYYY_MM_DD_<short_topic>`.

Minimum files:

1. `<name>.ts` - executable omnibus definition
2. `<name>.md` - vote/proposal human description

For contract-based omnibuses, add Solidity and ABI files if needed.

Quick command flow:

```bash
npm run omnibus:create
```

Contract generation is optional and should be run only for contract-mode omnibuses:

```bash
npm run omnibus:contract -- <omnibus_name>
npm run omnibus:build -- <omnibus_name>
```

Important for contract mode:

- `npm run omnibus:contract` is the first step.
- After successful generation/compilation, omnibus script MUST include either:
  - `deploy()` that returns deployed contract handles (as in `_example_contract_omnibus.ts`), or
  - `deployment: createContracts({...})` with already deployed addresses.

## 3. Start from template

Use [../../omnibuses/\_omnibus_template/\_omnibus_template.ts](../../omnibuses/_omnibus_template/_omnibus_template.ts) as the starting point.

Key fields:

- `network`: `mainnet` or `holesky`
- `voteId`: set only after vote creation
- `launchedAt`: set only after successful launch
- `executedAt`: set only after successful execution
- `quorumReached`: set only when quorum status is known

For a new omnibus, keep these as `undefined`.
The live-state example is [../../omnibuses/2025_09_01/2025_09_01.ts](../../omnibuses/2025_09_01/2025_09_01.ts), where these values are already filled (`voteId: 191`, `launchedAt: 23268269`, `executedAt: 23268272`, `quorumReached: true`).

## 4. Declare contracts

Create contract handles via `createContracts({...})`.

Rules:

1. Declare only contracts actually used in calls/tests.
2. Keep addresses explicit and reviewed.
3. Reuse ABIs from `abi/`. When a required ABI/interface is missing or stale, follow the [ABI sync guide](../ABI_SYNC.md) for source selection and regeneration.

See:

- Regular pattern: [../../omnibuses/\_example_regular_omnibus/\_example_regular_omnibus.ts](../../omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts)
- Contract pattern: [../../omnibuses/\_example_contract_omnibus/\_example_contract_omnibus.ts](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts)

### Access Control: OZ vs Aragon ACL

Before writing calls/tests, identify which permission model target contract uses.

1. OpenZeppelin `AccessControl` contracts:
   - Use `grantRole(...)`, `revokeRole(...)`, `hasRole(...)`.
   - Typical events: `RoleGranted`, `RoleRevoked`.
2. Aragon ACL-managed contracts:
   - Use ACL proxy methods `grantPermission(...)`, `revokePermission(...)`, `hasPermission(...)`.
   - Typical event on ACL: `SetPermission(entity, app, role, allowed)`.

Critical rule:

- `Lido` (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) is ACL-managed via Aragon ACL.
- Do not use `AccessControl` ABI/methods for Lido permissions.

Known Aragon ACL contracts (mainnet) used in this repo:

1. ACL Proxy: `0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb`
2. Kernel Proxy (ACL infrastructure): `0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc`
3. Lido app contract controlled through ACL permissions: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`

Practical check before finalize:

1. If call target is ACL-managed, all permission checks in tests must use `hasPermission`.
2. If call target is OZ AccessControl, tests must use `hasRole`.
3. Event expectations must match the permission system actually used.
4. Prefer built-in helpers from `checks.accessControl`:
   - `checkOzRoleGranted` / `checkOzRoleNotGranted`
   - `checkAragonPermissionGranted` / `checkAragonPermissionNotGranted`

## 5. Build calls section

`calls` is the core of the omnibus.

Prefer blueprint calls when possible:

- `blueprints.easyTrack.*`
- `blueprints.tokens.*`
- `blueprints.stakingModule.*`

Use direct calls when needed:

- `directCall(...)`
- `forwardCall(...)`
- `forwardCalls(...)`
- `executeCall(...)`
- `submitCalls(...)`

Each action must have:

1. Clear title (`"1. ..."`, `"2. ..."`) to keep execution order readable.
2. Correct function args.
3. Expected events (`event(...)`) for deterministic verification.

Examples:

- Mixed blueprint/direct sequence: `_example_regular_omnibus.ts`
- Nested forwarding/execute patterns: `_example_contract_omnibus.ts`
- Dual Governance submission flow: `2025_09_01.ts`

## 6. Implement optional deploy section

Use `deploy()` when you need helper contracts for validation or the omnibus contract itself.

For contract-based omnibuses this is mandatory:

1. Generate and compile contract first (`omnibus:contract` + `hardhat build`).
2. Add `deploy()` (recommended path) and return `omnibus` contract handle.
3. Or provide explicit `deployment: createContracts({...})` if contracts are already deployed.
4. Without one of these two, generated contract will not be used in real contract-mode omnibus workflow.

Regular example deploys only validator:

- `_example_regular_omnibus.ts` deploys `ExampleRegularOmnibusVoteStateValidator`.

Contract example deploys validator + omnibus contract:

- `_example_contract_omnibus.ts` deploys `ExampleContractOmnibusVoteStateValidator` and `ExampleContractOmnibus`.

If contract is already deployed on-chain, switch to explicit `deployment: createContracts({...})` mapping (see comment block in `_example_contract_omnibus.ts`).

## 7. Implement tests inside omnibus

Use both hooks when relevant:

1. `testVote`
   - Pre/post checks around vote execution (`passOmnibus()`).
   - Check balances, flags, and factories.
2. `testProposal`
   - Validate post-submission proposal enactment (`passProposals()`).
   - Remove this hook only if omnibus does not submit proposals.

Testing requirements (mandatory):

1. Cover every voting item from `calls` with at least one explicit assertion.
2. Prefer existing `checks.*` helpers when they exist; write custom assertions only for missing checks.
   - For permissions, use `checks.accessControl.*` helpers.
3. Validate state in four phases:
   - before vote
   - after vote
   - before DG proposal execution
   - after DG proposal execution
4. Validate functional behavior of each item, not only event emission.
5. Keep event check enabled and complete (`expectedEvents` per item).

Patterns to copy:

- Rich state checks: `_example_regular_omnibus.ts`
- Proposal-phase checks and assertions: `2025_09_01.ts`

## 8. Write markdown description

Use [../../omnibuses/\_omnibus_template/\_omnibus_template.md](../../omnibuses/_omnibus_template/_omnibus_template.md) structure:

1. `## Omnibus Description`

Keep markers:

- `<!-- OMNIBUS_DESCRIPTION --> ... <!-- OMNIBUS_DESCRIPTION -->`

Write free-form text inside this block.
Transformation of this description into concrete omnibus items is done by the agent, not by a code generator.

See completed examples:

- [../../omnibuses/\_example_regular_omnibus/\_example_regular_omnibus.md](../../omnibuses/_example_regular_omnibus/_example_regular_omnibus.md)
- [../../omnibuses/\_example_contract_omnibus/\_example_contract_omnibus.md](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.md)

## 9. Validate before run

Required sequence:

```bash
npx tsc --noEmit omnibuses/<omnibus_name>/<omnibus_name>.ts
npm run omnibus:test -- <omnibus_name>
npm run omnibus:simulate -- <omnibus_name>
```

Then run:

```bash
npm run omnibus:run -- <omnibus_name>
```

Notes:

1. `<omnibus_name>` is the folder/file name without `.ts`.
2. Keep keystore ready (`npm run ks:add -- <name>`).
3. Do not run on mainnet before all expected events and checks pass.
4. Omnibus TypeScript file MUST have zero TypeScript errors.

## 10. Contract generation review

`npm run omnibus:contract` is only the first step for contract-mode omnibuses.
After generation, review and normalize generated Solidity manually.

Mandatory post-generation review:

1. Review naming quality for constants and variables.
2. Replace ambiguous/generated names with domain-specific names.
3. Replace inline role/address literals in calls with named constants.
4. Keep constant naming aligned with omnibus `<name>.ts` (reuse names where possible).
5. Verify all role constants and permission bytes values against source description.
6. Verify addresses and constructor args.
7. Verify call ordering and comments against omnibus `.ts`.
8. Re-run formatting/linting and Solidity tests after manual cleanup.
9. Compilation of generated contract is mandatory immediately after generation and again after normalization:
   - `npm run omnibus:build -- <omnibus_name>`

## 11. Post-launch update checklist

After real launch/execution, update omnibus file:

1. `voteId`
2. `launchedAt`
3. `executedAt` (if executed)
4. `quorumReached` (if known)

This keeps historical files self-contained and auditable (see `2025_09_01.ts`).

## Common mistakes

1. Missing or incomplete `expectedEvents`.
2. Filling `voteId/launchedAt/executedAt` too early.
3. Using direct calls where existing blueprints already cover the operation.
4. Forgetting proposal-phase checks for `submitCalls(...)`.
5. Reusing old addresses/constants without explicit review.
