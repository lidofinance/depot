// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IEasyTrack {
    function removeEVMScriptFactory(address _evmScriptFactory) external;
    function addEVMScriptFactory(address _evmScriptFactory, bytes memory _permissions) external;
}
