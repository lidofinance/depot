# Tests for the external repos

You could mount this files into `core`, `scripts`, `dual-governance`, `staking-modules` and `stonks` containers.
It could help to develop all vouting tests in one place and move it to different repos after.

Every directory holds an example test written in the toolchain of its repo:

- `core/_example_omnibus_test_for_core_repo.ts` — hardhat + ethers
- `scripts/_example_omnibus_test_for_scripts_repo.py` — brownie
- `dual-governance/_example_omnibus_test_for_dual_governance_repo.t.sol` — forge
- `staking-modules/_example_omnibus_test_for_staking_modules_repo.t.sol` — forge
- `stonks/_example_omnibus_test_for_stonks_repo.ts` — hardhat

`--mount-tests --pattern default` runs exactly these files.
