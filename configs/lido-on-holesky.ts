import * as factories from "../typechain-types";

export default {
  agent: {
    impl: {
      factory: factories.Agent__factory,
      address: "0xF4aDA7Ff34c508B9Af2dE4160B6078D2b58FD46B",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xE92329EC7ddB11D25e25b3c21eeBf11f15eB325d",
    },
  },
  acl: {
    impl: {
      factory: factories.ACL__factory,
      address: "0xF1A087E055EA1C11ec3B540795Bd1A544e6dcbe9",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xfd1E42595CeC3E83239bf8dFc535250e7F48E0bC",
    },
  },
  voting: {
    impl: {
      factory: factories.Voting__factory,
      address: "0x53A61226DF1785B877BA775cE206c23876e2aa8c",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xdA7d2573Df555002503F29aA4003e398d28cc00f",
    },
  },
  ldo: {
    impl: {
      factory: factories.MiniMeToken__factory,
      address: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
    },
    proxy: null,
  },
  tokenManager: {
    impl: {
      factory: factories.TokenManager__factory,
      address: "0x6f0b994E6827faC1fDb58AF66f365676247bAD71",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xFaa1692c6eea8eeF534e7819749aD93a1420379A",
    },
  },
  callsScript: {
    impl: {
      factory: factories.CallsScript__factory,
      address: "0xAa8B4F258a4817bfb0058b861447878168ddf7B0",
    },
    proxy: null,
  },
  kernel: {
    impl: {
      factory: factories.Kernel__factory,
      address: "0x34c0cbf9836FD945423bD3d2d72880da9d068E5F",
    },
    proxy: {
      factory: factories.KernelProxy__factory,
      address: "0x3b03f75Ec541Ca11a223bB58621A3146246E1644",
    },
  },
  evmScriptRegistry: {
    impl: {
      factory: factories.EVMScriptRegistry__factory,
      address: "0x923B9Cab88E4a1d3de7EE921dEFBF9e2AC6e0791",
    },
    proxy: {
      factory: factories.AppProxyPinned__factory,
      address: "0xE1200ae048163B67D69Bc0492bF5FddC3a2899C0",
    },
  },
  finance: {
    impl: {
      factory: factories.Finance__factory,
      address: "0x1a76ED38B14C768e02b96A879d89Db18AC83EC53",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0xf0F281E5d7FBc54EAFcE0dA225CDbde04173AB16",
    },
  },
  stETH: {
    impl: {
      factory: factories.Lido__factory,
      address: "0x59034815464d18134A55EED3702b535D8A32c52b",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034",
    },
  },
  curatedStakingModule: {
    impl: {
      factory: factories.NodeOperatorsRegistry__factory,
      address: "0x8538930c385C0438A357d2c25CB3eAD95Ab6D8edf",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC",
    },
  },
  burner: {
    impl: {
      factory: factories.Burner__factory,
      address: "0x4E46BD7147ccf666E1d73A3A456fC7a68de82eCA",
    },
    proxy: null,
  },
  easyTrack: {
    impl: {
      factory: factories.EasyTrack__factory,
      address: "0x1763b9ED3586B08AE796c7787811a2E1bc16163a",
    },
    proxy: null,
  },
  stakingRouter: {
    impl: {
      factory: factories.StakingRouter__factory,
      address: "0x9b5890E950E3Df487Bb64E0A6743cdE791139152",
    },
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229",
    },
  },
  lidoLocator: {
    impl: {
      factory: factories.LidoLocator__factory,
      address: "0xa19a59af0680f6d9676abd77e1ba7e4c205f55a0",
    },
    proxy: {
      factory: factories.OssifiableProxy__factory,
      address: "0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8",
    },
  },
} as const;
