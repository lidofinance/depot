# Permissions and node operators example

This synthetic proposal runs only on a local mainnet fork. It exercises the current ACL, Agent, Dual Governance, StakingRouter and curated NodeOperatorsRegistry interfaces.

<!-- OMNIBUS_DESCRIPTION -->

1. Renew the Consensys key permission and update its operator settings
   - Through Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c`, revoke then restore `MANAGE_SIGNING_KEYS` (`0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee`) for `0xF45C77EadD434612fCD93db978B3E36B0D58eC99` on NodeOperatorsRegistry `0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5`, via ACL `0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb`. Restore precisely the constraint `arg0 EQ 21`.
   - Rename operator 21 to `Consensys (Depot test)`.
   - Set its reward address to Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c`.
   - Through StakingRouter `0xFdDf38947aFB03C621C71b06C9C70bce73f12999`, set module 1, operator 21 to soft target limit mode 1, count 0.
   - Deactivate operator 21.
   - Each of these six actions is a separate Agent forward in the same Dual Governance proposal, submitted to `0xC1db28B3301331277e307FDCfF8DE28242A4486E` by Voting `0x2e59A20f205bB85a89C53f1936454680651E618e`.

<!-- OMNIBUS_DESCRIPTION -->

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 1

```text
Renew the Consensys key permission for operator 21, rename it to Consensys (Depot test), direct its rewards to Aragon Agent, set a soft target limit of zero and deactivate it. Local fork example only.
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->

Historical read-only checks on 2026-09-06 at mainnet block **25918463** confirmed the Agent is the permission manager, the stored grant is exactly `arg0 EQ 21`, operator 21 is active, and module 1 resolves to the curated NodeOperatorsRegistry. Its vetted/deposited key counts are 11213/11150, so deactivation also emits the vetted-key reset. The test reads these values before execution and checks their changes.

Run the example with the current CLI: `npm run omnibus:test -- _example_permissions_node_operators`. This command does not pin a block: a new in-process fork starts at latest, while an existing local node keeps its current state, so the operator and permission assumptions must still hold. Reproducing the recorded block requires the deferred `--fork-block` support; the historical run below used that option.

The domain integration test requires `ETH_MAINNET_RPC_URL`; its two tests are skipped when the variable is absent. It revokes and restores the permission on an isolated local fork, compares the generated calldata byte-for-byte with the live permission, and exercises permitted and denied signing-key removal. These checks cover this proposal's effects; they do not replace the protocol permission inventory.

Historical verification on 2026-09-06:

- `npm run omnibus:build -- _example_permissions_node_operators`: passed.
- `forge test --match-path 'contracts/libraries/*.t.sol'`: 34 tests passed across 11 suites, none failed or skipped; includes the permissions and node-operator libraries.
- The four domain unit files plus `acl-permission-params.unit.test.ts`: 37 tests passed.
- `npx mocha --no-config --import=tsx --timeout 600000 test/omnibuses/helpers-permissions-node-operators.integration.test.ts`: both tests passed on an isolated Hardhat chain 31337 forked from mainnet block 25918463. Each test completed its snapshot/revert and impersonation cleanup, and the connection was closed.
- `omnibus:test` at the same fork block: local vote **205**, proposal **14**, all six Agent forwards passed with every receipt event accounted for. `isValidVoteScript(205)` returned true; the runtime completed its snapshot cleanup.
- EVM script: **2752 bytes**, keccak256 **`0x530a7002fd2cd11183d40a18bd4ef46ea16fe699085a77cec24d2332e72e5678`**. This is a synthetic local vote, not a reconstruction of the complete historical vote #201.
