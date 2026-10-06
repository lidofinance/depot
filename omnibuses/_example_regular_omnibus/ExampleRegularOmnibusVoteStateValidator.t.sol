// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ExampleRegularOmnibusVoteStateValidator} from "./ExampleRegularOmnibusVoteStateValidator.sol";
import {Test} from "forge-std/Test.sol";

contract MockERC20Balance {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 value) external {
        balanceOf[account] = value;
    }
}

contract ExampleRegularOmnibusVoteStateValidatorTest is Test {
    function test_ValidatesSpentBalanceBeforeAndAfterVote() external {
        MockERC20Balance token = new MockERC20Balance();
        address trackedAccount = address(0xBEEF);
        uint256 expectedSpent = 300;

        token.setBalance(trackedAccount, 1_000);
        ExampleRegularOmnibusVoteStateValidator validator =
            new ExampleRegularOmnibusVoteStateValidator(address(token), trackedAccount, expectedSpent);

        validator.validateStateBeforeVote();
        token.setBalance(trackedAccount, 700);
        validator.validateStateAfterVote();

        assertTrue(validator.beforeValidated());
        assertTrue(validator.afterValidated());
        assertEq(validator.balanceBefore(), 1_000);
        assertEq(validator.balanceAfter(), 700);
        assertEq(validator.spent(), expectedSpent);
    }
}
