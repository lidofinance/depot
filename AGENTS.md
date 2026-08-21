# AGENTS.md

Instructions for AI coding agents working in this repository.

Follow `CONTRIBUTING.md` for coding conventions (TypeScript, async safety, error handling, ESM, tests, git workflow).

## Skills

Project skills live in `.agents/skills/`. For omnibus work, follow `.agents/skills/omnibus-writer/SKILL.md`.

## Project overview

Hardhat 3 + TypeScript + Viem project for building, testing, and launching Lido governance omnibuses (batched on-chain proposals).

## Commands

```bash
# Omnibus lifecycle
npm run omnibus:create              # scaffold new omnibus from template
npm run omnibus:test -- <name>      # run omnibus tests on local hardhat node; prints the EVM script and saves it to omnibuses/<name>/<name>.evm-script.hex
npm run omnibus:test -- <name> --fork-block <n>  # same, fork pinned to block n
npm run omnibus:simulate -- <name>  # simulate omnibus execution
npm run omnibus:run -- <name>       # launch omnibus on mainnet/testnet
npm run omnibus:contract -- <name>  # generate Solidity contract (opt-in)
npm run omnibus:build -- <name>     # compile generated Solidity contract

# Contract surfaces
npm run abi:sync -- <Name> [--address 0x…] [--methods a,b] [--from-file abi.json] [--skipSol]
                                    # regenerate abi/<Name>.abi.ts + contracts/interfaces/I<Name>.sol
                                    # from the verified Etherscan ABI (address defaults to contracts/addresses/)

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

## Verification checklist

Before submitting changes, verify:

```bash
npx tsc --noEmit         # 0 errors
npm run lint             # 0 errors, 0 warnings
npm test                 # all passing
```
