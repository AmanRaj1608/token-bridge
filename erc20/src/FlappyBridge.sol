// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Flappy} from "./Flappy.sol";

/**
 * @title FlappyBridge
 * @notice A bridge contract for the Flappy token to facilitate cross-chain transfers
 * @dev Users deposit tokens to this contract, then the admin can burn them to initiate a cross-chain transfer
 */
contract FlappyBridge is Ownable {
    Flappy public flappyToken;

    // Emitted when tokens are burned for cross-chain transfer
    event BridgeInitiated(
        address indexed from,
        string destinationAddress,
        uint256 amount,
        uint256 timestamp
    );

    // Emitted when tokens are deposited to the bridge
    event BridgeDeposit(
        address indexed from,
        uint256 amount,
        uint256 timestamp
    );

    // Emitted when tokens are received from another chain
    event BridgeCompleted(
        string sourceChain,
        string sourceTxHash,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    constructor(
        address _flappyToken,
        address initialOwner
    ) Ownable(initialOwner) {
        flappyToken = Flappy(_flappyToken);
    }

    /**
     * @notice Deposit tokens into the bridge for future bridging
     * @param amount The amount of tokens to deposit
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");

        // Transfer tokens from user to bridge contract
        bool success = flappyToken.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Token transfer failed");

        // Emit event for tracking
        emit BridgeDeposit(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Initiate a bridge transfer by burning tokens
     * @dev Only the bridge admin can call this function
     * @param from The original depositor of the tokens
     * @param destinationAddress The recipient address on the destination chain
     * @param amount The amount of tokens to bridge
     */
    function burnForBridge(
        address from,
        string calldata destinationAddress,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(
            flappyToken.balanceOf(address(this)) >= amount,
            "Insufficient tokens in bridge"
        );

        // Burn the tokens using the burn function
        flappyToken.burn(amount);

        // Emit event for the relayer to pick up
        emit BridgeInitiated(from, destinationAddress, amount, block.timestamp);
    }

    /**
     * @notice Complete a bridge transfer by minting tokens to the recipient
     * @dev Only the bridge admin can call this function
     * @param to The recipient of the tokens on this chain
     * @param amount The amount of tokens to mint
     * @param sourceChain The source chain identifier
     * @param sourceTxHash The transaction hash on the source chain
     */
    function completeTransfer(
        address to,
        uint256 amount,
        string calldata sourceChain,
        string calldata sourceTxHash
    ) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");

        // Direct minting without ownership transfer
        // This requires the bridge to be authorized as a minter by the token owner
        flappyToken.mint(to, amount);

        // Emit event for tracking
        emit BridgeCompleted(
            sourceChain,
            sourceTxHash,
            to,
            amount,
            block.timestamp
        );
    }

    /**
     * @notice Allows the owner to withdraw tokens in case of emergency
     * @param amount The amount of tokens to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(
            flappyToken.balanceOf(address(this)) >= amount,
            "Insufficient tokens in bridge"
        );

        bool success = flappyToken.transfer(owner(), amount);
        require(success, "Token withdrawal failed");
    }
}
