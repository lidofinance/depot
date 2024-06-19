# 👷🏼 Harhdat Scripts Repo (WIP)

The repo contains the code draft to be used as a successor of the current scripts repo, which uses a deprecated brownie package.

The proper README will be added soon.

## Installation Process

1. Clone the repo
2. Install dependencies via `pnpm install`
3. Create typechain types via `SKIP_TYPECHAIN=true pnpm exec hardhat typechain`
4. Seed the `.env` file from the `.env.example`


## Test omnibus

```bash
pnpm run omnibus:test ${OMNIBUS_NAME}
```
