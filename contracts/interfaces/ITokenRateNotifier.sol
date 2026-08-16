// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Registry of observers notified about stETH/wstETH token rate updates.
interface ITokenRateNotifier {
    /// @param kind_ Observer calling convention: 0 — no arguments, 1 — with arguments.
    function addObserver(address observer_, uint8 kind_) external;
}
