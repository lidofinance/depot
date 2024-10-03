// SPDX-License-Identifier: MITs
pragma solidity 0.8.23;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

    error AlreadyInitialized();
    error SampleReverted(address sender, string message);

interface IIssuableERC20 {
    function mint(address account, uint256 value) external;

    function burn(address account, uint256 value) external;
}

contract HelloWorld {
    event HelloWorld();

    function main() external {
        emit HelloWorld();
    }
}

contract IssuableERC20 is IIssuableERC20, Ownable, ERC20 {
    constructor(
        address owner,
        string memory name,
        string memory symbol
    ) Ownable(owner) ERC20(name, symbol) {
        new HelloWorld();
    }

    function reinit(address owner_) external {
        _transferOwnership(owner_);
    }

    function mintWithResult(address account, uint256 value) external returns (bool) {
        mint(account, value);
        return true;
    }

    function mint(address account, uint256 value) public onlyOwner {
        _mint(account, value);
    }

    function burn(address account, uint256 value) external onlyOwner {
        _burn(account, value);
    }

    function destruct() external onlyOwner {
        _transferOwnership(address(this));
        selfdestruct(payable(msg.sender));
    }
}

contract TokenIssuer {
    IERC20 public token;
    bool public isInitialized;

    function initialize(address token_) external {
        if (isInitialized) {
            revert AlreadyInitialized();
        }
        isInitialized = true;
        token = IERC20(token_);
    }

    function mint(address recipient) external {}
}

// TODO: case with nested creates and case with nested selfdestructs
contract TracingSample {
    event SampleResult(address token, address clone, address clone2);

    function bye() public {
        selfdestruct(payable(msg.sender));
    }

    function testRevert() external {
        testSuccess();
        revert SampleReverted(msg.sender, "Maybe next time...");
    }

    function testSuccess() public returns (bool) {
        IssuableERC20 token = new IssuableERC20(address(this), "sample", "smp");
        token.mint(address(this), 10 ** 18);
        assert(token.balanceOf(address(this)) == 10 ** 18);

        address clone = Clones.clone(address(token));

        IssuableERC20(clone).reinit(address(this));
        IssuableERC20(clone).mint(address(this), 20 * 10 ** 18);
        assert(IssuableERC20(clone).balanceOf(address(this)) == 20 * 10 ** 18);

        address clone2 = Clones.cloneDeterministic(address(token), bytes32("0xdeadbeef"));

        token.destruct();

        IssuableERC20(clone2).reinit(address(this));
        IssuableERC20(clone2).mint(address(this), 30 * 10 ** 18);
        assert(IssuableERC20(clone2).balanceOf(address(this)) == 30 * 10 ** 18);
        IssuableERC20(clone2).destruct();

        emit SampleResult(address(token), clone, clone2);
        return true;
    }
}
