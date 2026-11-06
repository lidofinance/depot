# Upgrade snapshot example

`upgrade: true` on a one-item payload that repeats the Locator upgrade call from Scripts vote #204 (`upgrade_2026_08_05`). On a current mainnet fork this is a deliberate rollback rehearsal: the live Locator implementation `0x60E09F1791F1168d0450E4F100616B4a3F95119C` is newer, so the call restores the #204 implementation and `depositSecurityModule()` changes from `0x39BB5d491e98A44D1bfe8047A737a81E296a63E0` to `0xF573E9E3de1f86B085417ab294f56E7920B4e9Be`. The rollback only exercises the snapshot suites. It does not reproduce the complete historical vote or alter its recorded lifecycle. Run it on a current mainnet fork: the snapshot suites target current deployments, and at the #204 block **25724758** the current DSM does not exist yet (deployed at 25940562).

<!-- OMNIBUS_DESCRIPTION -->

1. Submit a Dual Governance proposal to roll the Lido Locator back to the #204 implementation, with one Agent forward:
   1.1. Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c` calls `proxy__upgradeTo(0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313)` on Lido Locator `0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb`.

<!-- OMNIBUS_DESCRIPTION -->

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 1

```text
Upgrade Lido Locator to 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313 for a local upgrade snapshot rehearsal.
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->

`omnibus:test` runs every upgrade snapshot suite. None of them reads the Locator EIP-1967 implementation slot; `testProposal` asserts that slot holds exactly the #204 implementation.

Command: `npm run omnibus:test -- _example_upgrade_snapshot --skip-acceptance`.

The command skips the clean-pass acceptance; snapshot cases never run it. The rejection of a sampled-slot change is covered by `test/depot/omnibuses/upgrade-snapshot.integration.test.ts`. A green run covers mainnet at its fork block only, not Hoodi.
