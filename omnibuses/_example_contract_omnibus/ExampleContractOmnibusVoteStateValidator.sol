// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
}

contract ExampleContractOmnibusVoteStateValidator {
    address private constant ZERO_ADDRESS = address(0);

    address public immutable TOKEN;
    address public immutable ACCOUNT;
    uint256 public immutable EXPECTED_SPENT;

    uint256 public balanceBefore;
    uint256 public balanceAfter;
    bool public beforeValidated;
    bool public afterValidated;

    event StateValidatedBefore(uint256 balanceBefore);
    event StateValidatedAfter(uint256 balanceAfter, uint256 spent);

    constructor(address token, address account, uint256 expectedSpent) {
        require(token != ZERO_ADDRESS, "token is zero");
        require(account != ZERO_ADDRESS, "account is zero");

        TOKEN = token;
        ACCOUNT = account;
        EXPECTED_SPENT = expectedSpent;
    }

    function validateStateBeforeVote() external {
        require(!beforeValidated, "before already validated");

        balanceBefore = IERC20Like(TOKEN).balanceOf(ACCOUNT);
        beforeValidated = true;

        emit StateValidatedBefore(balanceBefore);
    }

    function validateStateAfterVote() external {
        require(beforeValidated, "before not validated");
        require(!afterValidated, "after already validated");

        balanceAfter = IERC20Like(TOKEN).balanceOf(ACCOUNT);
        require(balanceAfter <= balanceBefore, "balance increased");

        uint256 spentAmount = balanceBefore - balanceAfter;
        require(spentAmount == EXPECTED_SPENT, "unexpected spent amount");

        afterValidated = true;
        emit StateValidatedAfter(balanceAfter, spentAmount);
    }

    function spent() external view returns (uint256) {
        if (!beforeValidated || !afterValidated) {
            return 0;
        }
        return balanceBefore - balanceAfter;
    }
}
