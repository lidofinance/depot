import * as factories from "../typechain-types";

export default {
  agent: {
    impl: {
      factory: factories.Agent__factory,
      address: "0xf6Fe63e6Ff034D60f9F2a403A046e1c456b11Ab4",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x4333218072D5d7008546737786663c38B4D561A4",
    },
  },
  acl: {
    impl: {
      factory: factories.ACL__factory,
      address: "0x74C81dd97338329367E5C52B1E3CBC5C757d9AEb",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xb3CF58412a00282934D3C3E73F49347567516E98",
    },
  },
  burner: {
    impl: {
      factory: factories.Burner__factory,
      address: "0x20c61C07C2E2FAb04BF5b4E12ce45a459a18f3B1",
    },
    proxy: null,
  },
  stETH: {
    impl: {
      factory: factories.Lido__factory,
      address: "0x26c41Ef17780cAdde73A2d00902e5e18856201b4",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F",
    },
  },
  insuranceFund: {
    impl: {
      factory: factories.InsuranceFund__factory,
      address: "0x000000000000cAdde73A2d00902e5e1885620000",
    },
    proxy: null,
  },
  curatedStakingModule: {
    impl: {
      factory: factories.NodeOperatorsRegistry__factory,
      address: "0xf95aAc2A1A7F1613fFD22D6A3E9421Ef1E63F777",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x5F867429616b380f1Ca7a7283Ff18C53a0033073",
    },
  },
  voting: {
    impl: {
      factory: factories.Voting__factory,
      address: "0x12D103a07Ac0429519C77E96781dFD5186119582",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xbc0B67b4553f4CF52a913DE9A6eD0057E2E758Db",
    },
  },
  ldo: {
    impl: {
      factory: factories.MiniMeToken__factory,
      address: "0x56340274fB5a72af1A3C6609061c451De7961Bd4",
    },
    proxy: null,
  },
  tokenManager: {
    impl: {
      factory: factories.TokenManager__factory,
      address: "0xDfe76d11b365f5e0023343A367f0b311701B3bc1",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xAb304946E8Ed172037aC9aBF9da58a6a7C8d443B",
    },
  },
  callsScript: {
    impl: {
      factory: factories.CallsScript__factory,
      address: "0x1B4FB0c1357Afd3F267c5E897eCFeC75938C7436",
    },
    proxy: null,
  },
  kernel: {
    impl: {
      factory: factories.Kernel__factory,
      address: "0x000000000000cAdde73A2d00902e5e1885620001",
    },
    proxy: {
      factory: factories.KernelProxy__factory,
      address: "0x000000000000cAdde73A2d00902e5e1885620002",
    },
  },
  evmScriptRegistry: {
    impl: {
      factory: factories.EVMScriptRegistry__factory,
      address: "0x000000000000cAdde73A2d00902e5e1885620003",
    },
    proxy: {
      factory: factories.AppProxyPinned__factory,
      address: "0x000000000000cAdde73A2d00902e5e1885620004",
    },
  },
  finance: {
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x75c7b1D23f1cad7Fb4D60281d7069E46440BC179",
    },
    impl: {
      factory: factories.Finance__factory,
      address: "0xB559EDC6A61f054Bf4931bB7eCD0A14f438Afa3F",
    },
  },
  easyTrack: {
    proxy: null,
    impl: {
      factory: factories.EasyTrack__factory,
      address: "0xAf072C8D368E4DD4A9d4fF6A76693887d6ae92Af",
    },
  },
  stakingRouter: {
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0xa3Dbd317E53D363176359E10948BA0b1c0A4c820",
    },
    impl: {
      factory: factories.StakingRouter__factory,
      address: "0x200c147cd3F344Ad09bAeCadA0a945106df337B4",
    },
  },
  lidoLocator: {
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0x1eDf09b5023DC86737b59dE68a8130De878984f5",
    },
    impl: {
      factory: factories.LidoLocator__factory,
      address: "0xc04CFDfC71B9c56D684bD8C7c03D8Be23A3087Aa",
    },
  },
} as const;
