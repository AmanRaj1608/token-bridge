// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Flappy} from "../src/Flappy.sol";

contract FlappyTest is Test {
    Flappy public flappy;
    address public owner;
    address public user;

    function setUp() public {
        owner = address(this);
        user = makeAddr("user");
        flappy = new Flappy(user, owner);
    }

    function test_InitialState() public view {
        assertEq(flappy.name(), "Flappy");
        assertEq(flappy.symbol(), "FLP");
        assertEq(flappy.owner(), owner);
        assertEq(flappy.balanceOf(user), 10000 * 10 ** 6);
    }

    function test_Mint() public {
        uint256 initialBalance = flappy.balanceOf(user);
        uint256 amount = 1000 * 10 ** 6;
        flappy.mint(user, amount);
        assertEq(flappy.balanceOf(user), initialBalance + amount);
    }

    function test_Burn() public {
        uint256 initialBalance = flappy.balanceOf(user);
        uint256 burnAmount = 500 * 10 ** 6;
        vm.prank(user);
        flappy.burn(burnAmount);
        assertEq(flappy.balanceOf(user), initialBalance - burnAmount);
    }

    function test_NonOwnerCannotMint() public {
        uint256 amount = 1000 * 10 ** 6;
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
                user
            )
        );
        flappy.mint(user, amount);
    }
}
