// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Encodes the permissions blob Easy Track stores alongside an EVM script factory.
///
/// @dev When a factory is registered, Easy Track is told exactly which methods on which
///      contracts the scripts it produces are allowed to call. That allowance is a packed
///      list of 24-byte entries — a 20-byte target address followed by the 4-byte selector
///      of the permitted method — and the scripts a factory produces are checked against it
///      on every motion.
///
///      Selectors must come from an interface (`IFinance.newImmediatePayment.selector`) rather
///      than a hex literal: an interface is checked by the compiler against the argument types,
///      a literal is not checked by anything.
///
/// Usage:
///
/// ```solidity
/// using EasyTrackPermissionsUtils for bytes;
///
/// bytes memory permissions = EasyTrackPermissionsUtils
///     .permission(FINANCE, IFinance.newImmediatePayment.selector)
///     .and(REGISTRY, IAllowedRecipientsRegistry.updateSpentAmount.selector);
/// ```
library EasyTrackPermissionsUtils {
    /// @notice Starts a permissions list with a single allowed method.
    /// @param target Contract the factory is allowed to call.
    /// @param selector Method on `target` the factory is allowed to call.
    function permission(address target, bytes4 selector) internal pure returns (bytes memory) {
        return abi.encodePacked(target, selector);
    }

    /// @notice Appends one more allowed method to a permissions list.
    function and(bytes memory self, address target, bytes4 selector) internal pure returns (bytes memory) {
        return abi.encodePacked(self, target, selector);
    }
}
