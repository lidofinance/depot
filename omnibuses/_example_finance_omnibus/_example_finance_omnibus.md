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
npm run omnibus:test -- _example_finance_omnibus --fork-block 24980861
```

## Verification

Verified on 2026-09-06 using an isolated in-process mainnet fork at block 24980861:

- The 288-byte EVM script matches mainnet vote #200. Its keccak256 is `0x7244221daa19efd5ba87f1d170ce0e46b7d9d5eb5fa6742d3e36a3ef2c014c62`.
- A fresh vote #201 executed on the fork. Treasury and recipient balances changed by 2500 stETH within 2 wei of rounding; their shares changed by the exact result of `getSharesByPooledEth(PAYMENT_AMOUNT)`.
- `LogScriptCall`, `NewTransaction`, `Transfer`, `TransferShares`, `VaultTransfer`, `ScriptResult` and `ExecuteVote` all matched, with no unparsed logs. Finance emitted no `NewPeriod` in this run; unit tests also cover multiple period transitions.
- The runner reverted its test snapshot, and the in-process fork ended with the command. No legacy interfaces, addresses or runtime behavior were added for this example.
