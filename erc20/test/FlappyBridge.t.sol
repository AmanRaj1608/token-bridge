// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Flappy} from "../src/Flappy.sol";
import {FlappyBridge} from "../src/FlappyBridge.sol";

/**
 * @title FlappyBridge
 * @notice A bridge contract for the Flappy token to facilitate cross-chain transfers
 * @dev Users deposit tokens to this contract, then the admin can burn them to initiate a cross-chain transfer
 */
contract FlappyBridgeTest is Test {
    Flappy public flappy;
    FlappyBridge public bridge;
    address public owner;
    address public user;
    uint256 public initialTokenAmount = 10000 * 10 ** 6; // 10000 tokens with 6 decimals

    function setUp() public {
        owner = address(this);
        user = makeAddr("user");

        // Deploy Flappy token
        flappy = new Flappy(user, owner);

        // Deploy FlappyBridge
        bridge = new FlappyBridge(address(flappy), owner);
    }

    function test_InitialState() public view {
        assertEq(address(bridge.flappyToken()), address(flappy));
        assertEq(bridge.owner(), owner);
    }

    function test_Deposit() public {
        uint256 depositAmount = 500 * 10 ** 6;

        // Approve token transfer
        vm.prank(user);
        flappy.approve(address(bridge), depositAmount);

        // Deposit tokens
        vm.prank(user);
        bridge.deposit(depositAmount);

        // Check balances
        assertEq(flappy.balanceOf(address(bridge)), depositAmount);
        assertEq(flappy.balanceOf(user), initialTokenAmount - depositAmount);
    }

    function test_BurnForBridge() public {
        uint256 depositAmount = 500 * 10 ** 6;
        uint256 burnAmount = 300 * 10 ** 6;
        string
            memory destinationAddress = "0x1234567890123456789012345678901234567890";

        // Approve token transfer
        vm.prank(user);
        flappy.approve(address(bridge), depositAmount);

        // Deposit tokens
        vm.prank(user);
        bridge.deposit(depositAmount);

        // Burn tokens for bridge
        vm.expectEmit(true, false, false, false);
        emit FlappyBridge.BridgeInitiated(
            user,
            destinationAddress,
            burnAmount,
            block.timestamp
        );

        vm.prank(owner);
        bridge.burnForBridge(user, destinationAddress, burnAmount);

        // Check balances
        assertEq(flappy.balanceOf(address(bridge)), depositAmount - burnAmount);
    }

    function test_CompleteTransfer() public {
        // Set up transfer parameters
        address recipient = makeAddr("recipient");
        uint256 transferAmount = 200 * 10 ** 6;
        string memory sourceChain = "solana";
        string memory sourceTxHash = "tx123456";

        // Make the bridge owner of the token so it can mint
        vm.prank(owner);
        flappy.transferOwnership(address(bridge));

        // Complete transfer
        vm.prank(owner);
        bridge.completeTransfer(
            recipient,
            transferAmount,
            sourceChain,
            sourceTxHash
        );

        // Check recipient received the tokens
        assertEq(flappy.balanceOf(recipient), transferAmount);
    }

    function test_EmergencyWithdraw() public {
        uint256 depositAmount = 500 * 10 ** 6;
        uint256 withdrawAmount = 400 * 10 ** 6;

        // Approve token transfer
        vm.prank(user);
        flappy.approve(address(bridge), depositAmount);

        // Deposit tokens
        vm.prank(user);
        bridge.deposit(depositAmount);

        // Emergency withdraw
        vm.prank(owner);
        bridge.emergencyWithdraw(withdrawAmount);

        // Check balances
        assertEq(
            flappy.balanceOf(address(bridge)),
            depositAmount - withdrawAmount
        );
        assertEq(flappy.balanceOf(owner), withdrawAmount);
    }

    function testFail_NonOwnerBurn() public {
        uint256 depositAmount = 500 * 10 ** 6;
        uint256 burnAmount = 300 * 10 ** 6;
        string
            memory destinationAddress = "0x1234567890123456789012345678901234567890";

        // Approve token transfer
        vm.prank(user);
        flappy.approve(address(bridge), depositAmount);

        // Deposit tokens
        vm.prank(user);
        bridge.deposit(depositAmount);

        // Try burn tokens by non-owner (should fail)
        vm.prank(user);
        bridge.burnForBridge(user, destinationAddress, burnAmount);
    }
}
