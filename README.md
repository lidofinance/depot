# 👷🏼 Depot

Depot builds, tests and launches Lido governance omnibuses. The Solidity vote contract defines the calls and Aragon EVM script; its TypeScript wrapper verifies state and events and handles custom deployment when needed.

## Install

Use Node 22 (`nvm use`; run `nvm install` first if the version is missing) and npm. Install Foundry nightly (`foundryup --install nightly`), the build CI uses, for Solidity formatting and library tests; Docker is needed for cross-repository suites.

```bash
git submodule update --init
nvm use
npm ci
npx hardhat compile
```

Configure the required endpoints and services locally using the documented names in `.env.example`. Keep credentials out of commits. Fork execution needs the selected network's RPC (`ETH_MAINNET_RPC_URL` or `ETH_HOODI_RPC_URL`); authoring and static checks do not require publishing or sending public transactions.

## Write an omnibus

Start with [the writing guide](docs/omnibuses/WRITING_OMNIBUS.md) and [examples catalogue](docs/omnibuses/README.md).

1. Run `npm run omnibus:create` and select the network and name.
2. Fill the Markdown description with exact actions and DG proposal metadata; put the public IPFS vote text in `<name>.ipfs.md`.
3. Implement the Solidity calls and TypeScript state/event checks.
4. Build, validate addresses, and test on the intended fork before deployment or launch.

For agent-assisted work, give the agent this prompt after step 2, replacing `<network>` and `<name>`:

```text
Use the omnibus-writer-sol skill to implement the omnibus <name> from omnibuses/ongoing/<network>/<name>/<name>.md: write the Solidity contract and the TypeScript test, then build it and run omnibus:test. Ask me about anything the description does not specify; do not deploy or launch.
```

The [omnibus-writer-sol](.agents/skills/omnibus-writer-sol/SKILL.md) skill inventories payload inputs and routes to the guide and [helper catalogue](.agents/skills/omnibus-writer-sol/HELPERS.md).

Use `npm run abi:sync -- <Name>` when a required ABI/interface is missing or stale; it generates the TypeScript ABI and Solidity interface for that contract. Follow [ABI sync](docs/ABI_SYNC.md) for source selection, proxy handling, filtering and verification. Confirm the intended deployment/version first; generation is not a request to update every ABI to latest.

## Commands

Run from the repository root; replace `<name>` with the intended omnibus. `<block>` is a block at which the network state matches what the test expects (before the vote executes); without `--fork-block` the latest block is used.

```bash
npm run omnibus:build -- <name>
npm run omnibus:test -- <name> --fork-block <block>
npx hardhat omnibus:trace <name>
```

Before a PR, run the [verification checklist](AGENTS.md#verification-checklist).

Depot unit and integration tests live under `test/depot/<module>/`; `npm test` is a shortcut for `test:depot:unit`, and `test:all` runs both Depot suites. Integration tests create Hardhat environments in process and need no RPC. `npm run test:sol` runs the Solidity library tests without a fork.

Shared deployed-protocol checks live in `test/protocol/acceptance/` and run through `omnibus:test` after the vote and all DG proposals, before snapshot restore. `test/protocol/snapshot/` holds upgrade snapshot suites that `omnibus:test` runs for `upgrade: true` votes. Per-vote `testVote`/`testProposal` checks stay in `omnibuses/ongoing/<network>/<name>/<name>.ts`.

`omnibus:test` picks its checks by the on-chain state of `voteId`: an executed vote is compared with its contract and checked by `testFinalState` and acceptance; trace is the historical inspection path. See the guide for complete event coverage, snapshots, deployment recording and public lifecycle fields.

Cross-repository tests are described in [the runbook](docs/omnibuses/WRITING_OMNIBUS.md#cross-repository-checks). Build checks, local models and live fork suites provide different evidence; report their results separately.

## Deployment and launch

Use `npx hardhat omnibus:deploy <name>` and `npx hardhat omnibus:launch <name>` for local rehearsals on a local dev node, without unlocking the key or uploading to IPFS. Public transactions require `--broadcast`, typing the network name to confirm, and are performed only by a human. Follow the [deployment runbook](docs/omnibuses/WRITING_OMNIBUS.md#7-rehearse-deployment-and-launch) before running either path.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for TypeScript, ESM, testing and formatting conventions. Agents start with [AGENTS.md](AGENTS.md). To inspect available task arguments, run `npx hardhat --help` or `npx hardhat <task-name> --help`.
