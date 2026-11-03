# Upgrade snapshot example

Opt-in `upgradeSnapshot` on a one-item payload that repeats the Locator upgrade call from Scripts vote #204 (`upgrade_2026_08_05`). It does not reproduce the complete historical vote or alter its recorded lifecycle. Use mainnet fork block **25724758**.

<!-- OMNIBUS_DESCRIPTION -->

1. Submit a Dual Governance proposal to upgrade the Lido Locator implementation, with one Agent forward:
   1.1. Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c` calls `proxy__upgradeTo(0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313)` on Lido Locator `0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb`.

<!-- OMNIBUS_DESCRIPTION -->

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 1

```text
Upgrade Lido Locator to 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313 for a local upgrade snapshot rehearsal.
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->

It selects the `first-slots` suite with an additional explicit observation of the Locator EIP-1967 implementation slot and declares only its exact new implementation as an allowed change. The other suites do not observe that slot.

Command: `npm run omnibus:test -- _example_upgrade_snapshot --fork-block 25724758 --skip-acceptance`.

Current acceptance expectations do not describe the historical fork block, so the command skips them. The rejection of an undeclared change is covered by `test/depot/omnibuses/upgrade-snapshot.integration.test.ts`. This example does not prove all six snapshot suites or current mainnet/Hoodi runtime coverage.
