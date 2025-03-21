// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Flappy} from "../src/Flappy.sol";

contract FlappyScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        Flappy flappy = new Flappy(msg.sender, msg.sender);
        console.log("Flappy token deployed to:", address(flappy));

        vm.stopBroadcast();
    }
}
