# Finance helper example

## Omnibus Description

<!-- OMNIBUS_DESCRIPTION -->

1. Transfer 2500 stETH 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 from Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c to Lido Labs Foundation operational multisig 0x95B521B4F55a447DB89f6a27f951713fC2035f3F

Aragon Voting 0x2e59A20f205bB85a89C53f1936454680651E618e calls `newImmediatePayment(address,address,uint256,string)` on Aragon Finance 0xB9E5CBB9CA5b0d659238807E84D0176930753d86 directly. The token is stETH, the recipient is the LLF multisig above, and the amount is `2500 * 10**18` wei. Finance pays from its Aragon Agent vault.

The payment reference is exactly:

```text
Transfer 2500 stETH from Aragon Agent to Lido Labs Foundation operational multisig
```

<!-- OMNIBUS_DESCRIPTION -->

## Source and scope

This is the single Finance item of mainnet vote #200, described in `scripts/archive/scripts/vote_2026_04_23.py`. That vote executed at block 24980862. The example demonstrates the Finance Solidity helper and its paired stETH event helper; it does not complete the archive or post-vote coverage migration tasks.

The test compares the built EVM script with vote #200, executes a fresh vote on the fork, checks both balances and exact share movements, and accounts for every event. Existing balances and accounting-period state are read before execution.

```bash
npm run omnibus:build -- _example_finance_omnibus
npm run omnibus:test -- _example_finance_omnibus --fork-block 24980861 --skip-acceptance
```

The fork block is the block before vote #200 executed; `--skip-acceptance` is required because the current DSM, which the acceptance reads, has no code at that block.
