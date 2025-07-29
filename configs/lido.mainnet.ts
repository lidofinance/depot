import { ACL_ABI } from "../abi/ACL.abi";
import { Agent_ABI } from "../abi/Agent.abi";
import { AppProxyPinned_ABI } from "../abi/AppProxyPinned.abi";
import { AppProxyUpgradeable_ABI } from "../abi/AppProxyUpgradeable.abi";
import { Burner_ABI } from "../abi/Burner.abi";
import { CallsScript_ABI } from "../abi/CallsScript.abi";
import { DualGovernance_ABI } from "../abi/DualGovernance.abi";
import { EasyTrack_ABI } from "../abi/EasyTrack.abi";
import { EmergencyProtectedTimelock_ABI } from "../abi/EmergencyProtectedTimelock.abi";
import { EVMScriptRegistry_ABI } from "../abi/EVMScriptRegistry.abi";
import { Finance_ABI } from "../abi/Finance.abi";
import { InsuranceFund_ABI } from "../abi/InsuranceFund.abi";
import { Kernel_ABI } from "../abi/Kernel.abi";
import { KernelProxy_ABI } from "../abi/KernelProxy.abi";
import { LidoLocator_ABI } from "../abi/LidoLocator.abi";
import { MiniMeToken_ABI } from "../abi/MiniMeToken.abi";
import { NodeOperatorsRegistry_ABI } from "../abi/NodeOperatorsRegistry.abi";
import { OssifiableProxy_ABI } from "../abi/OssifiableProxy.abi";
import { StakingRouter_ABI } from "../abi/StakingRouter.abi";
import { StETH_ABI } from "../abi/StETH.abi";
import { TokenManager_ABI } from "../abi/TokenManager.abi";
import { Voting_ABI } from "../abi/Voting.abi";
import { WstETH_ABI } from "../abi/WstETH.abi";
import { HashConsensus_ABI } from "../abi/HashConsensus.abi";
import { DualGovernanceConfigProvider_ABI } from "../abi/DualGovernanceConfigProvider.abi";
import { Executor_ABI } from "../abi/Executor.abi";
import { CSModule_ABI } from "../abi/CSModule.abi";
import { CSVerifier_ABI } from "../abi/CSVerifier.abi";
import { CSVerifier_Proposed_ABI } from "../abi/CSVerifier_Proposed.abi";

export type LidoMainnetConfig = typeof LIDO_ON_MAINNET;

export const LIDO_ON_MAINNET = {
  acl: {
    impl: { abi: ACL_ABI, address: "0x9f3b9198911054B122fDb865f8A5Ac516201c339" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb" },
  },
  agent: {
    impl: { abi: Agent_ABI, address: "0x3A93C17FC82CC33420d1809dDA9Fb715cc89dd37" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c" },
  },
  burner: { abi: Burner_ABI, address: "0xD15a672319Cf0352560eE76d9e89eAB0889046D3" },
  callsScript: { abi: CallsScript_ABI, address: "0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054" },
  curatedStakingModule: {
    impl: { abi: NodeOperatorsRegistry_ABI, address: "0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5" },
  },
  dualGovernanceConfigProvider: {
    abi: DualGovernanceConfigProvider_ABI,
    address: "0xa1692Af6FDfdD1030E4E9c4Bc429986FA64CB5EF",
  },
  dualGovernance: {
    abi: DualGovernance_ABI,
    address: "0xcdF49b058D606AD34c5789FD8c3BF8B3E54bA2db",
  },
  emergencyProtectedTimelock: {
    abi: EmergencyProtectedTimelock_ABI,
    address: "0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316",
  },
  adminExecutor: {
    abi: Executor_ABI,
    address: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
  },
  easyTrack: {
    abi: EasyTrack_ABI,
    address: "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
  },
  evmScriptRegistry: {
    impl: {
      abi: EVMScriptRegistry_ABI,
      address: "0xBF1Ce0Bc4EdaAD8e576b3b55e19c4C15Cf6999eb",
    },
    proxy: {
      abi: AppProxyPinned_ABI,
      address: "0x853cc0D5917f49B57B8e9F89e491F5E18919093A",
    },
  },
  finance: {
    impl: {
      abi: Finance_ABI,
      address: "0x836835289A2E81B66AE5d95b7c8dBC0480dCf9da",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xB9E5CBB9CA5b0d659238807E84D0176930753d86",
    },
  },
  insuranceFund: {
    abi: InsuranceFund_ABI,
    address: "0x8B3f33234ABD88493c0Cd28De33D583B70beDe35",
  },
  kernel: {
    impl: {
      abi: Kernel_ABI,
      address: "0x2b33CF282f867A7FF693A66e11B0FcC5552e4425",
    },
    proxy: {
      abi: KernelProxy_ABI,
      address: "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc",
    },
  },
  ldo: {
    abi: MiniMeToken_ABI,
    address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
  },
  lidoLocator: {
    impl: {
      abi: LidoLocator_ABI,
      address: "0x3ABc4764f0237923d52056CFba7E9AEBf87113D3",
    },
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    },
  },
  simpleDvt: {
    impl: {
      abi: NodeOperatorsRegistry_ABI,
      address: "0x1770044a38402e3cfca2fcfa0c84a093c9b42135",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433",
    },
  },
  stETH: {
    impl: {
      abi: StETH_ABI,
      address: "0x17144556fd3424EDC8Fc8A4C940B2D04936d17eb",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    },
  },
  voting: {
    impl: {
      abi: Voting_ABI,
      address: "0xf165148978fa3ce74d76043f833463c340cfb704",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x2e59A20f205bB85a89C53f1936454680651E618e",
    },
  },
  stakingRouter: {
    impl: {
      abi: StakingRouter_ABI,
      address: "0x89eDa99C0551d4320b56F82DDE8dF2f8D2eF81aA",
    },
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    },
  },
  tokenManager: {
    impl: {
      abi: TokenManager_ABI,
      address: "0xde3A93028F2283cc28756B3674BD657eaFB992f4",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xf73a1260d222f447210581DDf212D915c09a3249",
    },
  },
  wstEth: {
    abi: WstETH_ABI,
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  },
  accountingHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288",
  },
  veboHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
  },
  csHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0x71093efF8D8599b5fA340D665Ad60fA7C80688e4",
  },
  csModule: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F",
    },
    impl: {
      abi: CSModule_ABI,
      address: "0x8daEa53b17a629918CDFAB785C5c74077c1D895B",
    },
  },
  csVerifier: {
    abi: CSVerifier_ABI,
    address: "0x0c345dFa318f9F4977cdd4f33d80F9D0ffA38e8B",
  },
  csVerifier_Proposed: {
    abi: CSVerifier_Proposed_ABI,
    address: "0xeC6Cc185f671F627fb9b6f06C8772755F587b05d",
  },
} as const;
