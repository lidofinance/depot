import {
  ACL__factory,
  Agent__factory,
  AppProxyPinned__factory,
  AppProxyUpgradeable__factory,
  Burner__factory,
  CallsScript__factory,
  EVMScriptRegistry__factory,
  EasyTrack__factory,
  Finance__factory,
  InsuranceFund__factory,
  KernelProxy__factory,
  Kernel__factory,
  MiniMeToken__factory,
  NodeOperatorsRegistry__factory,
  TokenManager__factory,
  Voting__factory,
} from "../typechain-types";
import { Lido__factory } from "../typechain-types/factories/interfaces";

export default {
  agent: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [Agent__factory, ""],
  },
  voting: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [Voting__factory, ""],
  },
  ldo: {
    proxy: null,
    impl: [MiniMeToken__factory, ""],
  },
  tokenManager: {
    impl: [TokenManager__factory, ""],
    proxy: [AppProxyUpgradeable__factory, ""],
  },
  callsScript: { proxy: null, impl: [CallsScript__factory, ""] },
  burner: { proxy: null, impl: [Burner__factory, ""] },
  lido: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [Lido__factory, ""],
  },
  insuranceFund: {
    proxy: null,
    impl: [InsuranceFund__factory, ""],
  },
  kernel: {
    proxy: [KernelProxy__factory, ""],
    impl: [Kernel__factory, ""],
  },
  evmScriptRegistry: {
    impl: [EVMScriptRegistry__factory, ""],
    proxy: [AppProxyPinned__factory, ""],
  },
  acl: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [ACL__factory, ""],
  },
  easyTrack: {
    proxy: null,
    impl: [EasyTrack__factory, ""],
  },
  finance: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [Finance__factory, ""],
  },
  nodeOperatorsRegistry: {
    proxy: [AppProxyUpgradeable__factory, ""],
    impl: [NodeOperatorsRegistry__factory, ""],
  },
} as const;
