// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Shared Depot infrastructure addresses on Ethereum mainnet.
/// @dev Verified against https://docs.lido.fi/deployed-contracts/; CallsScript source is linked below.
///      Vote contracts declare their addresses locally, including addresses also listed here.
library MainnetAddresses {
    // ---
    // Aragon DAO
    // ---

    address internal constant LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address internal constant KERNEL = 0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc;
    address internal constant ACL = 0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb;
    address internal constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address internal constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address internal constant TOKEN_MANAGER = 0xf73a1260d222f447210581DDf212D915c09a3249;
    address internal constant EVM_SCRIPT_REGISTRY = 0x853cc0D5917f49B57B8e9F89e491F5E18919093A;
    // https://etherscan.io/address/0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054#code
    address internal constant CALLS_SCRIPT = 0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054;

    // ---
    // Dual Governance
    // ---

    address internal constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address internal constant TIMELOCK = 0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316;
    /// @dev Executor #1 of the Dual Governance timelock — the admin executor.
    address internal constant ADMIN_EXECUTOR = 0x23E0B465633FF5178808F4A75186E2F2F9537021;

    // ---
    // Protocol
    // ---

    address internal constant LIDO_LOCATOR = 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb;
    address internal constant STAKING_ROUTER = 0xFdDf38947aFB03C621C71b06C9C70bce73f12999;
}
