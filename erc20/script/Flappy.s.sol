// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Flappy} from "../src/Flappy.sol";
import {FlappyBridge} from "../src/FlappyBridge.sol";

contract FlappyScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy the Flappy token first
        Flappy flappy = new Flappy(deployer, deployer);
        console.log("Flappy token deployed to:", address(flappy));

        // Then deploy the bridge using the token address
        FlappyBridge bridge = new FlappyBridge(address(flappy), deployer);
        console.log("Flappy Bridge deployed to:", address(bridge));

        // Mint 10000 tokens to the owner
        flappy.mint(deployer, 10000 * 10 ** flappy.decimals());
        console.log("Minted 10000 tokens to the owner");

        vm.stopBroadcast();
    }
}
