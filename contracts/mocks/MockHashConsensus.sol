// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract MockHashConsensus {
    uint64 private immutable slotsPerEpoch;
    uint64 private immutable secondsPerSlot;
    uint64 private immutable genesisTime;
    uint256 private immutable initialRefSlot;

    constructor(uint64 slotsPerEpoch_, uint64 secondsPerSlot_, uint64 genesisTime_, uint256 initialRefSlot_) {
        slotsPerEpoch = slotsPerEpoch_;
        secondsPerSlot = secondsPerSlot_;
        genesisTime = genesisTime_;
        initialRefSlot = initialRefSlot_;
    }

    function getChainConfig() external view returns (uint64, uint64, uint64) {
        return (slotsPerEpoch, secondsPerSlot, genesisTime);
    }

    function getInitialRefSlot() external view returns (uint256) {
        return initialRefSlot;
    }
}
