import { ACL_ABI } from "../../abi/ACL.abi";
import { Agent_ABI } from "../../abi/Agent.abi";
import { CallsScript_ABI } from "../../abi/CallsScript.abi";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { EmergencyProtectedTimelock_ABI } from "../../abi/EmergencyProtectedTimelock.abi";
import { EVMScriptRegistry_ABI } from "../../abi/EVMScriptRegistry.abi";
import { Executor_ABI } from "../../abi/Executor.abi";
import { Kernel_ABI } from "../../abi/Kernel.abi";
import { LidoLocator_ABI } from "../../abi/LidoLocator.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";
import { TimelockedGovernance_ABI } from "../../abi/TimelockedGovernance.abi";
import { TokenManager_ABI } from "../../abi/TokenManager.abi";
import { Voting_ABI } from "../../abi/Voting.abi";
import { Contract, contract } from "../contracts";
import { NetworkName } from "../network";

export type AgentContract = Contract<typeof Agent_ABI>;
export type VotingContract = Contract<typeof Voting_ABI>;
export type TimelockContract = Contract<typeof EmergencyProtectedTimelock_ABI>;
export type CallsScriptContract = Contract<typeof CallsScript_ABI>;
export type ExecutorContract = Contract<typeof Executor_ABI>;
export type TokenManagerContract = Contract<typeof TokenManager_ABI>;
export type MiniMeToken = Contract<typeof MiniMeToken_ABI>;
export type DualGovernanceContract = Contract<typeof DualGovernance_ABI>;
export type TimelockedGovernanceContract = Contract<typeof TimelockedGovernance_ABI>;

type LidoLocatorContract = Contract<typeof LidoLocator_ABI>;
type KernelContract = Contract<typeof Kernel_ABI>;
type ACLContract = Contract<typeof ACL_ABI>;
type EVMScriptRegistryContract = Contract<typeof EVMScriptRegistry_ABI>;

export interface GovernanceContracts {
  ldo: MiniMeToken;
  voting: VotingContract;
  timelock: TimelockContract;
  callsScript: CallsScriptContract;
  adminExecutor: ExecutorContract;
  tokenManager: TokenManagerContract;
  dualGovernance: DualGovernanceContract;
  locator: LidoLocatorContract;
  kernel: KernelContract;
  acl: ACLContract;
  evmScriptRegistry: EVMScriptRegistryContract;
}

type GovernanceAddresses = {
  [T in keyof GovernanceContracts]: GovernanceContracts[T]["address"];
};

function getGovernanceAddresses(network: NetworkName): GovernanceAddresses {
  if (network === "mainnet") {
    return {
      ldo: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
      callsScript: "0x5cEb19e1890f677c3676d5ecDF7c501eBA01A054",
      voting: "0x2e59A20f205bB85a89C53f1936454680651E618e",
      timelock: "0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316",
      adminExecutor: "0x23E0B465633FF5178808F4A75186E2F2F9537021",
      tokenManager: "0xf73a1260d222f447210581DDf212D915c09a3249",
      dualGovernance: "0xC1db28B3301331277e307FDCfF8DE28242A4486E",
      locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
      kernel: "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc",
      acl: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb",
      evmScriptRegistry: "0x853cc0D5917f49B57B8e9F89e491F5E18919093A",
    };
  }

  if (network === "hoodi") {
    return {
      ldo: "0xEf2573966D009CcEA0Fc74451dee2193564198dc",
      callsScript: "0xfB3cB48d81eC8c7f2013a8dc9fA46D2D48112c3A",
      voting: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
      timelock: "0x0A5E22782C0Bd4AddF10D771f0bF0406B038282d",
      adminExecutor: "0x0eCc17597D292271836691358B22340b78F3035B",
      tokenManager: "0x8ab4a56721Ad8e68c6Ad86F9D9929782A78E39E5",
      dualGovernance: "0x9CAaCCc62c66d817CC59c44780D1b722359795bF",
      locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
      kernel: "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d",
      acl: "0x78780e70Eae33e2935814a327f7dB6c01136cc62",
      evmScriptRegistry: "0xe4D32427b1F9b12ab89B142eD3714dCAABB3f38c",
    };
  }
  if (network === "holesky") {
    return {
      ldo: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
      callsScript: "0xfB3cB48d81eC8c7f2013a8dc9fA46D2D48112c3A",
      voting: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
      timelock: "0x0A5E22782C0Bd4AddF10D771f0bF0406B038282d",
      adminExecutor: "0x0eCc17597D292271836691358B22340b78F3035B",
      tokenManager: "0x6f0b994E6827faC1fDb58AF66f365676247bAD71",
      dualGovernance: "0x490bf377734CA134A8E207525E8576745652212e",
      locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
      kernel: "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d",
      acl: "0x78780e70Eae33e2935814a327f7dB6c01136cc62",
      evmScriptRegistry: "0xe4D32427b1F9b12ab89B142eD3714dCAABB3f38c",
    };
  }
  throw new Error(`Unsupported network ${network}`);
}

export function getGovernanceContracts(network: NetworkName): GovernanceContracts {
  const addresses = getGovernanceAddresses(network);
  return {
    acl: contract(ACL_ABI, addresses.acl, "ACL__Proxy"),
    ldo: contract(MiniMeToken_ABI, addresses.ldo, "LDO"),
    kernel: contract(Kernel_ABI, addresses.kernel, "Kernel__Proxy"),
    voting: contract(Voting_ABI, addresses.voting, "Voting__Proxy"),
    locator: contract(LidoLocator_ABI, addresses.locator, "LidoLocator__Proxy"),
    callsScript: contract(CallsScript_ABI, addresses.callsScript, "CallsScript"),
    timelock: contract(EmergencyProtectedTimelock_ABI, addresses.timelock, "EmergencyProtectedTimelock"),
    adminExecutor: contract(Executor_ABI, addresses.adminExecutor, "AdminExecutor"),
    tokenManager: contract(TokenManager_ABI, addresses.tokenManager, "TokenManager__Proxy"),
    dualGovernance: contract(DualGovernance_ABI, addresses.dualGovernance, "DualGovernance"),
    evmScriptRegistry: contract(EVMScriptRegistry_ABI, addresses.evmScriptRegistry, "EVMScriptRegistry__Proxy"),
  };
}
