# Upgrade snapshot example

`upgrade: true` on a one-item payload that repeats the Locator upgrade call from Scripts vote #204 (`upgrade_2026_08_05`). It does not reproduce the complete historical vote or alter its recorded lifecycle. Run it on a current mainnet fork: the snapshot suites target current deployments, and at the #204 block **25724758** the current DSM does not exist yet (deployed at 25940562).

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

`omnibus:test` runs every upgrade snapshot suite. None of them reads the Locator EIP-1967 implementation slot; `testProposal` asserts that slot holds exactly the new implementation.

Command: `npm run omnibus:test -- _example_upgrade_snapshot --skip-acceptance`.

The command skips the clean-pass acceptance; snapshot cases never run it. The rejection of a sampled-slot change is covered by `test/depot/omnibuses/upgrade-snapshot.integration.test.ts`. A green run covers mainnet at its fork block only, not Hoodi.
