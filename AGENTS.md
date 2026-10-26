# AGENTS.md

Instructions for AI coding agents working in this repository.

Follow `CONTRIBUTING.md` for coding conventions (TypeScript, async safety, error handling, ESM, tests, git workflow).

## Skills

Project skills live in `.agents/skills/`. For omnibus authoring or fork tests, follow [.agents/skills/omnibus-writer-sol/SKILL.md](.agents/skills/omnibus-writer-sol/SKILL.md).

For ABI/interface generation, source selection or regeneration review, read [docs/ABI_SYNC.md](docs/ABI_SYNC.md).

## Project overview

Hardhat 3 + TypeScript + Viem project for building, testing, and launching Lido governance omnibuses (batched on-chain proposals).

## Commands

```bash
# Omnibus lifecycle
npm run omnibus:create              # scaffold new omnibus from template
npm run omnibus:build -- <name>     # compile the authored Solidity contract
npm run omnibus:test -- <name>      # test an unexecuted omnibus on a local fork
npx hardhat omnibus:trace <name>    # inspect execution traces
npx hardhat omnibus:deploy <name>   # local deployment rehearsal
npx hardhat omnibus:launch <name>   # local launch rehearsal
npm run lint:vote-addresses -- omnibuses/<name> # validate vote-local addresses

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
  omnibuses/            # Solidity contract reader, runtime, state/event checks
  traces/               # transaction tracing (debug_traceTransaction)
tasks/                  # Hardhat tasks (omnibus:*, keystore:*)
omnibuses/              # actual omnibus scripts and templates
test/                   # all tests
contracts/mocks/        # mock Solidity contracts for integration tests
```

Use [the writing guide](docs/omnibuses/WRITING_OMNIBUS.md) for fork pinning, exact proposal metadata, event grouping and deployment/launch authorization. Solidity owns the payload; the TypeScript wrapper owns tests and custom deployment.

## Verification checklist

Before submitting changes, verify:

```bash
npx tsc --noEmit         # 0 errors
npm run lint             # 0 errors, 0 warnings
npm test                 # all passing
```
