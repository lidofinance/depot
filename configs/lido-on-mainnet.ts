import * as factories from "../typechain-types";

export default {
  acl: {
    impl: {
      factory: factories.ACL__factory,
      address: "0x9f3b9198911054B122fDb865f8A5Ac516201c339",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb",
    },
  },
  agent: {
    impl: {
      factory: factories.Agent__factory,
      address: "0x3A93C17FC82CC33420d1809dDA9Fb715cc89dd37",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    },
  },
  burner: {
    impl: {
      factory: factories.Burner__factory,
      address: "0xD15a672319Cf0352560eE76d9e89eAB0889046D3",
    },
    proxy: null,
  },
  callsScript: {
    impl: {
      factory: factories.CallsScript__factory,
      address: "0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054",
    },
    proxy: null,
  },
  curatedStakingModule: {
    impl: {
      factory: factories.NodeOperatorsRegistry__factory,
      address: "0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
    },
  },
  easyTrack: {
    impl: {
      factory: factories.EasyTrack__factory,
      address: "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
    },
    proxy: null,
  },
  evmScriptRegistry: {
    impl: {
      factory: factories.EVMScriptRegistry__factory,
      address: "0xBF1Ce0Bc4EdaAD8e576b3b55e19c4C15Cf6999eb",
    },
    proxy: {
      factory: factories.AppProxyPinned__factory,
      address: "0x853cc0D5917f49B57B8e9F89e491F5E18919093A",
    },
  },
  finance: {
    impl: {
      factory: factories.Finance__factory,
      address: "0x836835289A2E81B66AE5d95b7c8dBC0480dCf9da",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xB9E5CBB9CA5b0d659238807E84D0176930753d86",
    },
  },
  insuranceFund: {
    impl: {
      factory: factories.InsuranceFund__factory,
      address: "0x8B3f33234ABD88493c0Cd28De33D583B70beDe35",
    },
    proxy: null,
  },
  kernel: {
    impl: {
      factory: factories.Kernel__factory,
      address: "0x2b33CF282f867A7FF693A66e11B0FcC5552e4425",
    },
    proxy: {
      factory: factories.KernelProxy__factory,
      address: "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc",
    },
  },
  ldo: {
    impl: {
      factory: factories.MiniMeToken__factory,
      address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    },
    proxy: null,
  },
  lidoLocator: {
    impl: {
      factory: factories.LidoLocator__factory,
      address: "0x1D920cc5bACf7eE506a271a5259f2417CaDeCE1d",
    },
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    },
  },
  simpleDvt: {
    impl: {
      factory: factories.NodeOperatorsRegistry__factory,
      address: "0x1770044a38402e3cfca2fcfa0c84a093c9b42135",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433",
    },
  },
  stETH: {
    impl: {
      factory: factories.Lido__factory,
      address: "0x17144556fd3424EDC8Fc8A4C940B2D04936d17eb",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    },
  },
  stakingRouter: {
    impl: {
      factory: factories.StakingRouter__factory,
      address: "0xD8784e748f59Ba711fB5643191Ec3fAdD50Fb6df",
    },
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    },
  },
  tokenManager: {
    impl: {
      factory: factories.TokenManager__factory,
      address: "0xde3A93028F2283cc28756B3674BD657eaFB992f4",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xf73a1260d222f447210581DDf212D915c09a3249",
    },
  },
  voting: {
    impl: {
      factory: factories.Voting__factory,
      address: "0xf165148978fa3ce74d76043f833463c340cfb704",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x2e59A20f205bB85a89C53f1936454680651E618e",
    },
  },
  wStEth: {
    impl: {
      factory: factories.CallsScript__factory,
        address: "0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054",
    },
    proxy: null,
  },
} as const;