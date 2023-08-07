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
    proxy: [AppProxyUpgradeable__factory, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
    impl: [Agent__factory, "0x3A93C17FC82CC33420d1809dDA9Fb715cc89dd37"],
  },
  voting: {
    proxy: [AppProxyUpgradeable__factory, "0x2e59A20f205bB85a89C53f1936454680651E618e"],
    impl: [Voting__factory, "0x72fb5253AD16307B9E773d2A78CaC58E309d5Ba4"],
  },
  ldo: {
    proxy: null,
    impl: [MiniMeToken__factory, "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32"],
  },
  tokenManager: {
    impl: [TokenManager__factory, "0xde3A93028F2283cc28756B3674BD657eaFB992f4"],
    proxy: [AppProxyUpgradeable__factory, "0xf73a1260d222f447210581DDf212D915c09a3249"],
  },
  callsScript: {
    proxy: null,
    impl: [CallsScript__factory, "0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054"],
  },
  burner: {
    proxy: null,
    impl: [Burner__factory, "0xD15a672319Cf0352560eE76d9e89eAB0889046D3"],
  },
  lido: {
    proxy: [AppProxyUpgradeable__factory, "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"],
    impl: [Lido__factory, "0x17144556fd3424EDC8Fc8A4C940B2D04936d17eb"],
  },
  insuranceFund: {
    proxy: null,
    impl: [InsuranceFund__factory, "0x8B3f33234ABD88493c0Cd28De33D583B70beDe35"],
  },
  kernel: {
    proxy: [KernelProxy__factory, "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc"],
    impl: [Kernel__factory, "0x2b33CF282f867A7FF693A66e11B0FcC5552e4425"],
  },
  evmScriptRegistry: {
    impl: [EVMScriptRegistry__factory, "0xBF1Ce0Bc4EdaAD8e576b3b55e19c4C15Cf6999eb"],
    proxy: [AppProxyPinned__factory, "0x853cc0D5917f49B57B8e9F89e491F5E18919093A"],
  },
  acl: {
    proxy: [AppProxyUpgradeable__factory, "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb"],
    impl: [ACL__factory, "0x9f3b9198911054B122fDb865f8A5Ac516201c339"],
  },
  easyTrack: {
    proxy: null,
    impl: [EasyTrack__factory, "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea"],
  },
  finance: {
    proxy: [AppProxyUpgradeable__factory, "0xB9E5CBB9CA5b0d659238807E84D0176930753d86"],
    impl: [Finance__factory, "0x836835289A2E81B66AE5d95b7c8dBC0480dCf9da"],
  },
  nodeOperatorsRegistry: {
    proxy: [AppProxyUpgradeable__factory, "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5"],
    impl: [NodeOperatorsRegistry__factory, "0x8538930c385C0438A357d2c25CB3eAD95Ab6D8ed"],
  },
} as const;
