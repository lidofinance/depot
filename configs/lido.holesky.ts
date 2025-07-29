import { ACL_ABI } from "../abi/ACL.abi";
import { Agent_ABI } from "../abi/Agent.abi";
import { AppProxyPinned_ABI } from "../abi/AppProxyPinned.abi";
import { AppProxyUpgradeable_ABI } from "../abi/AppProxyUpgradeable.abi";
import { Burner_ABI } from "../abi/Burner.abi";
import { CallsScript_ABI } from "../abi/CallsScript.abi";
import { CSModule_ABI } from "../abi/CSModule.abi";
import { CSVerifier_ABI } from "../abi/CSVerifier.abi";
import { DualGovernance_ABI } from "../abi/DualGovernance.abi";
import { DualGovernanceConfigProvider_ABI } from "../abi/DualGovernanceConfigProvider.abi";
import { EasyTrack_ABI } from "../abi/EasyTrack.abi";
import { EmergencyProtectedTimelock_ABI } from "../abi/EmergencyProtectedTimelock.abi";
import { EVMScriptRegistry_ABI } from "../abi/EVMScriptRegistry.abi";
import { Executor_ABI } from "../abi/Executor.abi";
import { Finance_ABI } from "../abi/Finance.abi";
import { HashConsensus_ABI } from "../abi/HashConsensus.abi";
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

export type LidoHoleskyConfig = typeof LIDO_ON_HOLESKY;

export const LIDO_ON_HOLESKY = {
  acl: {
    impl: {
      abi: ACL_ABI,
      address: "0xF1A087E055EA1C11ec3B540795Bd1A544e6dcbe9",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xfd1E42595CeC3E83239bf8dFc535250e7F48E0bC",
    },
  },
  agent: {
    impl: {
      abi: Agent_ABI,
      address: "0xF4aDA7Ff34c508B9Af2dE4160B6078D2b58FD46B",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xE92329EC7ddB11D25e25b3c21eeBf11f15eB325d",
    },
  },
  burner: {
    abi: Burner_ABI,
    address: "0x4E46BD7147ccf666E1d73A3A456fC7a68de82eCA",
  },
  callsScript: {
    abi: CallsScript_ABI,
    address: "0xAa8B4F258a4817bfb0058b861447878168ddf7B0",
  },
  curatedStakingModule: {
    impl: {
      abi: NodeOperatorsRegistry_ABI,
      address: "0x8538930c385C0438A357d2c25CB3eAD95Ab6D8edf",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC",
    },
  },
  dualGovernance: {
    abi: DualGovernance_ABI,
    address: "0x490bf377734CA134A8E207525E8576745652212e",
  },
  dualGovernanceConfigProvider: {
    abi: DualGovernanceConfigProvider_ABI,
    address: "0xF3257b7E333Cdd15df92CBc3BAF645D83D22B97B",
  },
  emergencyProtectedTimelock: {
    abi: EmergencyProtectedTimelock_ABI,
    address: "0xe9c5FfEAd0668AFdBB9aac16163840d649DB76DD",
  },
  adminExecutor: {
    abi: Executor_ABI,
    address: "0x8BD0a916faDa88Ba3accb595a3Acd28F467130e8",
  },
  easyTrack: {
    abi: EasyTrack_ABI,
    address: "0x1763b9ED3586B08AE796c7787811a2E1bc16163a",
  },
  evmScriptRegistry: {
    impl: {
      abi: EVMScriptRegistry_ABI,
      address: "0x923B9Cab88E4a1d3de7EE921dEFBF9e2AC6e0791",
    },
    proxy: {
      abi: AppProxyPinned_ABI,
      address: "0xE1200ae048163B67D69Bc0492bF5FddC3a2899C0",
    },
  },
  finance: {
    impl: {
      abi: Finance_ABI,
      address: "0x1a76ED38B14C768e02b96A879d89Db18AC83EC53",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xf0F281E5d7FBc54EAFcE0dA225CDbde04173AB16",
    },
  },
  kernel: {
    impl: {
      abi: Kernel_ABI,
      address: "0x34c0cbf9836FD945423bD3d2d72880da9d068E5F",
    },
    proxy: {
      abi: KernelProxy_ABI,
      address: "0x3b03f75Ec541Ca11a223bB58621A3146246E1644",
    },
  },
  ldo: {
    abi: MiniMeToken_ABI,
    address: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
  },
  lidoLocator: {
    impl: {
      abi: LidoLocator_ABI,
      address: "0xa19a59af0680f6d9676abd77e1ba7e4c205f55a0",
    },
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8",
    },
  },
  simpleDvt: {
    impl: {
      abi: NodeOperatorsRegistry_ABI,
      address: "0x11a93807078f8BB880c1BD0ee4C387537de4b4b6",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x834aa47DCd21A32845099a78B4aBb17A7f0bD503",
    },
  },
  stETH: {
    impl: {
      abi: StETH_ABI,
      address: "0x59034815464d18134A55EED3702b535D8A32c52b",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034",
    },
  },
  voting: {
    impl: {
      abi: Voting_ABI,
      address: "0x53A61226DF1785B877BA775cE206c23876e2aa8c",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0xdA7d2573Df555002503F29aA4003e398d28cc00f",
    },
  },
  stakingRouter: {
    impl: {
      abi: StakingRouter_ABI,
      address: "0x9b5890E950E3Df487Bb64E0A6743cdE791139152",
    },
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229",
    },
  },
  tokenManager: {
    impl: {
      abi: TokenManager_ABI,
      address: "0xde3A93028F2283cc28756B3674BD657eaFB992f4",
    },
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x6f0b994E6827faC1fDb58AF66f365676247bAD71",
    },
  },
  wstEth: {
    abi: WstETH_ABI,
    address: "0x8d09a4502Cc8Cf1547aD300E066060D043f6982D",
  },
  accountingHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0xa067FC95c22D51c3bC35fd4BE37414Ee8cc890d2",
  },
  veboHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0xe77Cf1A027d7C10Ee6bb7Ede5E922a181FF40E8f",
  },
  csHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0xbF38618Ea09B503c1dED867156A0ea276Ca1AE37",
  },
  csModule: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0x4562c3e63c2e586cD1651B958C22F88135aCAd4f",
    },
    impl: {
      abi: CSModule_ABI,
      address: "0xaF370636f618bC97c8Af2aBC33aAD426b1f4164A",
    },
  },
  csVerifier: {
    abi: CSVerifier_ABI,
    address: "0xC099dfD61F6E5420e0Ca7e84D820daAd17Fc1D44",
  },
} as const;
