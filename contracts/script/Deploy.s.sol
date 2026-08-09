// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RWAAgentRegistry} from "../src/RWAAgentRegistry.sol";

/// @notice Deploy with:
///   forge script script/Deploy.s.sol --rpc-url xlayer_testnet --broadcast
contract Deploy is Script {
    function run() external returns (RWAAgentRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        registry = new RWAAgentRegistry();
        console2.log("RWAAgentRegistry deployed at:", address(registry));
        vm.stopBroadcast();
    }
}
