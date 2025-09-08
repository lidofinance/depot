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
import { Escrow_ABI } from "../abi/Escrow.abi";
import { WithdrawalQueue_ABI } from "../abi/WithdrawalQueue.abi";

export type LidoHoodiConfig = typeof LIDO_ON_HOODI;

export const LIDO_ON_HOODI = {
  acl: {
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x78780e70Eae33e2935814a327f7dB6c01136cc62" },
    impl: { abi: ACL_ABI, address: "0xaA3DC2Bd465020A348c18b13EaeC3790A93702AB" },
  },
  agent: {
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD" },
    impl: { abi: Agent_ABI, address: "0x16906517570FC844056fe28F10DFdAAA355086c2" },
  },
  burner: { abi: Burner_ABI, address: "0x4e9A9ea2F154bA34BE919CD16a4A953DCd888165" },
  callsScript: { abi: CallsScript_ABI, address: "0xfB3cB48d81eC8c7f2013a8dc9fA46D2D48112c3A" },
  curatedStakingModule: {
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5" },
    impl: { abi: NodeOperatorsRegistry_ABI, address: "0x95F00b016bB31b7182D96D25074684518246E42a" },
  },
  dualGovernanceConfigProvider: {
    abi: DualGovernanceConfigProvider_ABI,
    address: "0x2b685e6fB288bBb7A82533BAfb679FfDF6E5bb33",
  },
  dualGovernance: {
    abi: DualGovernance_ABI,
    address: "0x9CAaCCc62c66d817CC59c44780D1b722359795bF",
  },
  vetoSignallingEscrow: {
    abi: Escrow_ABI,
    address: "0x781afe6C8D768CEaA9a97f2A75714e80AE0e83B9 ",
  },
  emergencyProtectedTimelock: {
    abi: EmergencyProtectedTimelock_ABI,
    address: "0x0A5E22782C0Bd4AddF10D771f0bF0406B038282d",
  },
  adminExecutor: {
    abi: Executor_ABI,
    address: "0x0eCc17597D292271836691358B22340b78F3035B",
  },
  easyTrack: {
    abi: EasyTrack_ABI,
    address: "0x284D91a7D47850d21A6DEaaC6E538AC7E5E6fc2a",
  },
  evmScriptRegistry: {
    proxy: {
      abi: AppProxyPinned_ABI,
      address: "0xe4D32427b1F9b12ab89B142eD3714dCAABB3f38c",
    },
    impl: {
      abi: EVMScriptRegistry_ABI,
      address: "0x700316238B6398bcADB267Af0478af65129C78E6",
    },
  },
  finance: {
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x254Ae22bEEba64127F0e59fe8593082F3cd13f6b",
    },
    impl: {
      abi: Finance_ABI,
      address: "0x7fF12A0F52E10908082B35DB950FB6D8C1F627B1",
    },
  },
  kernel: {
    proxy: {
      abi: KernelProxy_ABI,
      address: "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d",
    },
    impl: {
      abi: Kernel_ABI,
      address: "0xEEf274E065964Ec22Bd44ddEbE7557c6638b368C",
    },
  },
  ldo: {
    abi: MiniMeToken_ABI,
    address: "0xEf2573966D009CcEA0Fc74451dee2193564198dc",
  },
  lidoLocator: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    },
    impl: {
      abi: LidoLocator_ABI,
      address: "0x003f20CD17e7683A7F88A7AfF004f0C44F0cfB31",
    },
  },
  simpleDvt: {
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x2b8B52A5e3485853aDccED669B1d0bbF31D40222",
    },
    impl: {
      abi: NodeOperatorsRegistry_ABI,
      address: "0x41734bEBDe003976DF1B5Cf1D727Ede0222df783",
    },
  },
  stETH: {
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    },
    impl: {
      abi: StETH_ABI,
      address: "0x65da873a408e893A9c7b0bfB84646A3Ab55948A7",
    },
  },
  voting: {
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
    },
    impl: {
      abi: Voting_ABI,
      address: "0x3a84F1156E30570519e316b47b2ca72cac2fBE25",
    },
  },
  stakingRouter: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    },
    impl: {
      abi: StakingRouter_ABI,
      address: "0xd5F04A81ac472B2cB32073CE9dDABa6FaF022827",
    },
  },
  tokenManager: {
    proxy: {
      abi: AppProxyUpgradeable_ABI,
      address: "0x8ab4a56721Ad8e68c6Ad86F9D9929782A78E39E5",
    },
    impl: {
      abi: TokenManager_ABI,
      address: "0x8ab4a56721Ad8e68c6Ad86F9D9929782A78E39E5",
    },
  },
  wstEth: {
    abi: WstETH_ABI,
    address: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
  },
  accountingHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0x32EC59a78abaca3f91527aeB2008925D5AaC1eFC",
  },
  veboHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0x30308CD8844fb2DB3ec4D056F1d475a802DCA07c",
  },
  withdrawalQueue: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    },
    impl: {
      abi: WithdrawalQueue_ABI,
      address: "0xD0a60e52837e045F4567193Cf8921191C486eCD5",
    },
  },
  csHashConsensus: {
    abi: HashConsensus_ABI,
    address: "0x54f74a10e4397dDeF85C4854d9dfcA129D72C637",
  },
  csModule: {
    proxy: {
      abi: OssifiableProxy_ABI,
      address: "0x79CEf36D84743222f37765204Bec41E92a93E59d",
    },
    impl: {
      abi: CSModule_ABI,
      address: "0x9aE387EB2abA80B9B1ebc145597D593EFAE61f31",
    },
  },
  csVerifier: {
    abi: CSVerifier_ABI,
    address: "0xB6bafBD970a4537077dE59cebE33081d794513d6",
  },
  csVerifier_Proposed: {
    abi: CSVerifier_Proposed_ABI,
    address: "0xf805b3711cBB48F15Ae2bb27095ddC38c5339968",
  },
} as const;
