// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IDualGovernanceConfigProvider {
    struct DualGovernanceConfig {
        uint128 firstSealRageQuitSupport;
        uint128 secondSealRageQuitSupport;
        //
        uint32 minAssetsLockDuration;
        //
        uint40 vetoSignallingMinDuration;
        uint40 vetoSignallingMaxDuration;
        uint40 vetoSignallingMinActiveDuration;
        uint40 vetoSignallingDeactivationMaxDuration;
        uint40 vetoCooldownDuration;
        //
        uint40 rageQuitExtensionPeriodDuration;
        uint40 rageQuitEthWithdrawalsMinDelay;
        uint40 rageQuitEthWithdrawalsMaxDelay;
        uint40 rageQuitEthWithdrawalsDelayGrowth;
    }

    function getDualGovernanceConfig() external view returns (DualGovernanceConfig memory config);
}
