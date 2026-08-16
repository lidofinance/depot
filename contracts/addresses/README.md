# Address registry

One library per network, all exposing the **same constant names**. An omnibus imports the
library for its network and never writes a raw address literal:

```solidity
import { MainnetAddresses as Addresses } from "contracts/addresses/MainnetAddresses.sol";

contract Omnibus_2026_08_05 is OmnibusBase {
  constructor() OmnibusBase(Addresses.VOTING) {}
}
```

Why it exists: in a Solidity-first omnibus, a wrong address literal compiles, reads fine and
even passes a fork test — the call still goes through, just to the wrong contract. Routing
every address through one reviewed file is what makes that failure mode impossible.

## Two tiers

**Canonical registry** — this directory. Long-lived protocol and DAO contracts. Every address
here is cross-checked against `configs/config_mainnet.py` of the `scripts` repository, which is
the registry used for production votes today. That check is the entry requirement: an address
that cannot be confirmed there does not belong in this directory.

**Vote-scoped addresses** — a block of named constants at the top of the omnibus contract, for
contracts the vote itself deploys or that are not yet part of the canonical config. They are
short-lived by nature and are reviewed together with the vote, against its description. The
layout mirrors the vote scripts reviewers already read: description first, address constants
right below it, calls after that.

The split keeps the canonical registry auditable once instead of once per vote.

## Lint rules

**Address literals are permitted only in a constant declaration.** A literal inside a call is a
build error. Every address in a vote therefore has a name, and every name sits in one of two
reviewable places: this registry or the constants block of the omnibus.

**Vote-scoped constants must match the vote description.** The addresses named in the omnibus
and the addresses named in its description are compared as sets, and any address present in one
and missing from the other fails the build. This is what catches the failure mode the registry
exists for: a wrong address compiles, reads fine, and still passes a fork test, because the call
does go through — just to the wrong contract.

> Status: both conventions are in place, neither check is written yet.

## Adding a network

Copy the constant names verbatim — code that reads `Addresses.AGENT` must keep working after
changing nothing but the import. If a contract does not exist on a network, leave it out
rather than pointing the name at a placeholder: a missing constant fails to compile, a wrong
one does not.
