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
    }

    function test_Mint() public {
        uint256 amount = 1000 ether;
        flappy.mint(user, amount);
        assertEq(flappy.balanceOf(user), amount);
    }

    function test_Burn() public {
        uint256 amount = 1000 ether;
        flappy.mint(user, amount);
        vm.prank(user);
        flappy.burn(500 ether);
        assertEq(flappy.balanceOf(user), 500 ether);
    }

    function test_NonOwnerCannotMint() public {
        uint256 amount = 1000 ether;
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), user));
        flappy.mint(user, amount);
    }
}
