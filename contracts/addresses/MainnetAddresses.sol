// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MainnetAddresses
/// @notice Canonical Lido addresses on Ethereum mainnet.
/// @dev Omnibus contracts must reference addresses through this library instead of
///      inlining hex literals, so that a wrong address cannot silently reach a vote.
///      Every network exposes the same constant names — swap the import, keep the code.
///
///      Provenance: every address below is cross-checked against `configs/config_mainnet.py`
///      of the `scripts` repository, which is the registry used for production votes today.
///      Contracts deployed by a specific vote and not yet part of that config belong to a
///      per-omnibus address library instead — see contracts/addresses/README.md.
library MainnetAddresses {
    uint256 internal constant CHAIN_ID = 1;

    // ---
    // Aragon DAO
    // ---

    address internal constant LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address internal constant KERNEL = 0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc;
    address internal constant ACL = 0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb;
    address internal constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address internal constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address internal constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address internal constant TOKEN_MANAGER = 0xf73a1260d222f447210581DDf212D915c09a3249;
    address internal constant EVM_SCRIPT_REGISTRY = 0x853cc0D5917f49B57B8e9F89e491F5E18919093A;
    address internal constant CALLS_SCRIPT = 0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054;

    // ---
    // Dual Governance
    // ---

    address internal constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address internal constant TIMELOCK = 0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316;
    /// @dev Executor #1 of the Dual Governance timelock — the admin executor.
    address internal constant ADMIN_EXECUTOR = 0x23E0B465633FF5178808F4A75186E2F2F9537021;
    address internal constant DUAL_GOVERNANCE_CONFIG_PROVIDER = 0xa1692Af6FDfdD1030E4E9c4Bc429986FA64CB5EF;
    address internal constant RESEAL_MANAGER = 0x7914b5a1539b97Bd0bbd155757F25FD79A522d24;

    // ---
    // Protocol
    // ---

    address internal constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
    address internal constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
    address internal constant LIDO_LOCATOR = 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb;
    address internal constant STAKING_ROUTER = 0xFdDf38947aFB03C621C71b06C9C70bce73f12999;
    address internal constant NODE_OPERATORS_REGISTRY = 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5;
    address internal constant SIMPLE_DVT = 0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433;
    address internal constant TOKEN_RATE_NOTIFIER = 0xbe05d12Fd10919F1881125006523452F6aFF791b;

    // ---
    // Easy Track
    // ---

    address internal constant EASY_TRACK = 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea;
    address internal constant EASY_TRACK_EVM_SCRIPT_EXECUTOR = 0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977;

    // ---
    // Committees
    // ---

    address internal constant EMERGENCY_BRAKES_MULTISIG = 0x73b047fe6337183A454c5217241D780a932777bD;
    address internal constant EMERGENCY_ACTIVATION_COMMITTEE = 0x8B7854488Fde088d686Ea672B6ba1A5242515f45;
    address internal constant EMERGENCY_EXECUTION_COMMITTEE = 0xC7792b3F2B399bB0EdF53fECDceCeB97FBEB18AF;
    address internal constant RESEAL_COMMITTEE = 0xFFe21561251c49AdccFad065C94Fb4931dF49081;
}
