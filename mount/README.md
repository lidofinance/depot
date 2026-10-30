# Tests for the external repos

You can mount these files into the `core`, `scripts`, `dual-governance`, `staking-modules`, and `stonks` containers.
This helps develop all voting tests in one place before moving them to the different repositories.

Every directory holds an example test written in the toolchain of its repo:

- `core/_example_omnibus_test_for_core_repo.ts` — hardhat + ethers
- `scripts/_example_omnibus_test_for_scripts_repo.py` — brownie
- `dual-governance/_example_omnibus_test_for_dual_governance_repo.t.sol` — forge
- `staking-modules/_example_omnibus_test_for_staking_modules_repo.t.sol` — forge
- `stonks/_example_omnibus_test_for_stonks_repo.ts` — hardhat

`--mount-tests --pattern default` runs exactly these files.
