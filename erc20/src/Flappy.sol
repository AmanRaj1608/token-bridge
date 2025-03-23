// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract Flappy is ERC20, ERC20Burnable, Ownable, ERC20Permit {
    constructor(
        address recipient,
        address initialOwner
    ) ERC20("Flappy", "FLP") Ownable(initialOwner) ERC20Permit("Flappy") {
        _mint(recipient, 10000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /// @dev Override the default decimals
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
