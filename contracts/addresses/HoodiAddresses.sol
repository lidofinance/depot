// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Shared Depot infrastructure addresses on Hoodi.
/// @dev Verified against https://docs.lido.fi/deployed-contracts/hoodi/.
library HoodiAddresses {
    address internal constant LDO = 0xEf2573966D009CcEA0Fc74451dee2193564198dc;
    address internal constant KERNEL = 0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d;
    address internal constant ACL = 0x78780e70Eae33e2935814a327f7dB6c01136cc62;
    address internal constant VOTING = 0x49B3512c44891bef83F8967d075121Bd1b07a01B;
    address internal constant TOKEN_MANAGER = 0x8ab4a56721Ad8e68c6Ad86F9D9929782A78E39E5;
    address internal constant EVM_SCRIPT_REGISTRY = 0xe4D32427b1F9b12ab89B142eD3714dCAABB3f38c;
    address internal constant CALLS_SCRIPT = 0xfB3cB48d81eC8c7f2013a8dc9fA46D2D48112c3A;
    address internal constant DUAL_GOVERNANCE = 0x9CAaCCc62c66d817CC59c44780D1b722359795bF;
    address internal constant TIMELOCK = 0x0A5E22782C0Bd4AddF10D771f0bF0406B038282d;
    address internal constant ADMIN_EXECUTOR = 0x0eCc17597D292271836691358B22340b78F3035B;
    address internal constant LIDO_LOCATOR = 0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8;
}
