# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project overview

Hardhat 3 + TypeScript + Viem project for building, testing, and launching Lido governance omnibuses (batched on-chain proposals).

## Setup

```bash
nvm use           # Node 22+
npm install
```

## Commands

```bash
# Omnibus lifecycle
npm run omnibus:create              # scaffold new omnibus from template
npm run omnibus:test -- <name>      # run omnibus tests on local hardhat node
npm run omnibus:simulate -- <name>  # simulate omnibus execution
npm run omnibus:run -- <name>       # launch omnibus on mainnet/testnet
npm run omnibus:contract -- <name>  # generate Solidity contract (opt-in)
npm run omnibus:build -- <name>     # compile generated Solidity contract

# Quality
npm run lint                        # ESLint (0 errors, 0 warnings expected)
npm run lint:fix                    # auto-fix
npm test                            # unit tests (mocha)
npm run test:integration            # integration tests (needs hardhat node on :8545)
npx tsc --noEmit                    # typecheck
```

## Architecture

```
src/
  aragon-votes-tools/   # vote lifecycle: create, pass, execute
  common/               # utils, env, formatting, assert
  contracts/            # contract abstraction, ABI helpers
  contract-info-resolver/ # etherscan contract resolution
  docker/               # Docker container management for multi-repo tests
  hardhat-keystores/    # encrypted keystore management
  hardhat/              # HH3 task runner helpers
  ipfs/                 # IPFS/Pinata upload
  network/              # RPC client (viem), DevRpcClient with test actions
  omnibuses/            # omnibus runtime, blueprints, checks, contract generator
  traces/               # transaction tracing (debug_traceTransaction)
tasks/                  # Hardhat tasks (omnibus:*, keystore:*)
omnibuses/              # actual omnibus scripts and templates
test/                   # all tests
contracts/mocks/        # mock Solidity contracts for integration tests
```

## Test conventions

All tests live in `test/` (not in `src/`).

- `test/<module>/<name>.unit.test.ts` — fast, no network
- `test/<module>/<name>.integration.test.ts` — needs hardhat node

**Mocking rules (ESM):**

- `sinon.stub(object, "method")` on plain objects — OK
- `sinon.stub(esmModule, "export")` — FORBIDDEN (ESM exports are immutable)
- For module-level deps use DI containers: `export const deps = { fn }`, stub via `sinon.stub(deps, "fn")`
- For HTTP mock `globalThis.fetch` directly (nock v13 doesn't intercept native fetch)

## Code style

- ESLint flat config (`eslint.config.mjs`), 0 errors / 0 warnings
- Prettier with defaults (semi: true, printWidth: 120)
- Conventional commits enforced via commitlint
- Pre-commit: lint-staged runs eslint + prettier on staged files

**ESLint error rules (block commit):**

- `no-floating-promises` — always await or `void` fire-and-forget
- `no-misused-promises` — no async in void callbacks
- `require-await` — no unnecessary async
- `no-unused-vars` — remove or prefix with `_`
- `prefer-const` — use const when not reassigned

## Git workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Husky pre-commit: lint-staged
- Husky commit-msg: commitlint
- Do not commit `.env`, `.keystores/`, `artifacts/`, `node_modules/`

## Omnibus workflow

For creating/modifying omnibuses, read `docs/omnibuses/WRITING_OMNIBUS.md`.

Canonical examples:

- `omnibuses/_omnibus_template/_omnibus_template.ts`
- `omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts`
- `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
- `omnibuses/2025_09_01/2025_09_01.ts`

Key rules:

1. Prefer blueprint calls over custom calls
2. Determine permission model before coding (OZ AccessControl vs Aragon ACL)
3. Lido (`0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`) uses Aragon ACL — never use OZ methods
4. Contract generation is opt-in — only after explicit user request
5. Validate before launch: `npx tsc --noEmit`, `npm run omnibus:test`, `npm run omnibus:simulate`

## Verification checklist

Before submitting changes, verify:

```bash
npx tsc --noEmit         # 0 errors
npm run lint             # 0 errors, 0 warnings
npm test                 # all passing
```
