# 👷🏼 Depot

Depot builds, tests and launches Lido governance omnibuses. The Solidity vote contract defines the calls and Aragon EVM script; its TypeScript wrapper verifies state and events and handles custom deployment when needed.

## Install

Use Node 22 (`nvm use`) and npm. Install Foundry with Forge 1.8.1 (`foundryup --install v1.8.1`) for Solidity formatting; Docker is needed for cross-repository suites.

```bash
nvm use
npm install
```

Configure the required endpoints and services locally using the documented names in `.env.example`. Keep credentials out of commits. Fork execution needs the selected network's RPC (`ETH_MAINNET_RPC_URL` or `ETH_HOODI_RPC_URL`; the Hoodi variable is not listed in `.env.example`); authoring and static checks do not require publishing or sending public transactions.

## Write an omnibus

Start with [the writing guide](docs/omnibuses/WRITING_OMNIBUS.md) and [examples catalogue](docs/omnibuses/README.md).

1. Run `npm run omnibus:create` and select the network and name.
2. Fill the Markdown description with exact actions and DG proposal metadata.
3. Implement the Solidity calls and TypeScript state/event checks.
4. Build, validate addresses, and test on the intended fork before deployment or launch.

For agent-assisted work, ask the agent to use [omnibus-writer-sol](.agents/skills/omnibus-writer-sol/SKILL.md). The skill inventories payload inputs and routes to the guide and [helper catalogue](.agents/skills/omnibus-writer-sol/HELPERS.md).

Use `npm run abi:sync -- <Name>` when a required ABI/interface is missing or stale; it generates the TypeScript ABI and Solidity interface for that contract. Follow [ABI sync](docs/ABI_SYNC.md) for source selection, proxy handling, filtering and verification. Confirm the intended deployment/version first; generation is not a request to update every ABI to latest.

## Commands

Run from the repository root; replace `<name>` and `<block>` with the intended omnibus and fork block.

```bash
npm run omnibus:build -- <name>
npm run lint:vote-addresses -- omnibuses/<name>
npm run omnibus:test -- <name> --fork-block <block>
npx hardhat omnibus:trace <name>
npx tsc --noEmit
npm run lint
npm test
```

`omnibus:test` rejects recorded execution (`executedAt` defined); trace is the historical inspection path. See the guide for complete event coverage, snapshots, deployment recording and public lifecycle fields.

Cross-repository tests and mounted test examples are described in [the runbook](docs/omnibuses/WRITING_OMNIBUS.md#cross-repository-checks) and [mount/README.md](mount/README.md). Build checks, local models and live fork suites provide different evidence; report their results separately.

## Deployment and launch

Use `npx hardhat omnibus:deploy <name>` and `npx hardhat omnibus:launch <name>` for local rehearsals. These commands still use keystores and may publish the description to a configured IPFS provider. Public transactions require `--broadcast` on each command and explicit authorization. Follow the [deployment runbook](docs/omnibuses/WRITING_OMNIBUS.md#7-rehearse-deployment-and-launch) before running either path.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for TypeScript, ESM, testing and formatting conventions. Agents start with [AGENTS.md](AGENTS.md). To inspect available task arguments, run `npx hardhat --help` or `npx hardhat <task-name> --help`.
