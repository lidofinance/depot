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
npm run omnibus:test -- <name>      # test the vote on a local fork at its on-chain stage (by voteId)
npx hardhat omnibus:trace <name>    # inspect execution traces
npx hardhat omnibus:deploy <name>   # local deployment rehearsal
npx hardhat omnibus:launch <name>   # local launch rehearsal

# Quality
npm run lint                        # ESLint (0 errors, 0 warnings expected)
npm run lint:fix                    # auto-fix
npm run types                       # tsc --noEmit
npm run test:depot:unit              # Depot unit tests (npm test is a shortcut)
npm run test:depot:integration       # Depot integration tests (in-process Hardhat)
npm run test:all                     # both Depot suites
npm run test:sol                     # Solidity library tests (forge, no fork)
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
test/depot/             # Depot unit/integration tests and helpers
test/protocol/acceptance/ # deployed protocol checks after vote/DG execution
test/protocol/snapshot/  # upgrade state/action comparisons, run for upgrade: true
contracts/mocks/        # mock Solidity contracts for integration tests
```

Use [the writing guide](docs/omnibuses/WRITING_OMNIBUS.md) for fork pinning, exact proposal metadata, event grouping and the deployment/launch runbook. Agents never run `--broadcast` deploy or launch against Mainnet/Hoodi and never read keystore contents; real operations are human-only. Never print `.env` values: RPC URLs carry provider keys. Solidity owns the payload; the TypeScript wrapper owns per-vote `testVote`/`testProposal` checks and custom deployment. Per-vote checks stay in the vote wrapper `omnibuses/ongoing/<network>/<name>/<name>.ts`. Shared acceptance runs after vote/DG execution; upgrade snapshots compare isolated scenarios before and after execution, as described in the writing guide.

## Verification checklist

Before submitting changes, run what CI runs:

```bash
npm run prettier:check         # Prettier
npm run fmt:sol:check          # forge fmt
npm run lint                   # ESLint, 0 warnings
npm run types                  # tsc --noEmit, 0 errors
npm run test:depot:unit        # all passing
npm run test:depot:integration # in-process Hardhat, no RPC required
npm run test:sol               # Solidity library tests, no fork
```

For a vote change, also get the manual address review from [Addresses and titles](docs/omnibuses/WRITING_OMNIBUS.md#addresses-and-titles); no command replaces it.
