// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Easy Track registry holding the addresses a payment motion is allowed to pay out to.
interface IAllowedRecipientsRegistry {
    function addRecipient(address _recipient, string memory _title) external;
    function removeRecipient(address _recipient) external;
    function updateSpentAmount(uint256 _payoutAmount) external;
    function isRecipientAllowed(address _recipient) external view returns (bool);
}
