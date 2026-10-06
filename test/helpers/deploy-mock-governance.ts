import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Hex } from "viem";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { contract, Contract } from "../../src/contracts";
import { Voting_ABI } from "../../abi/Voting.abi";
import { TokenManager_ABI } from "../../abi/TokenManager.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function loadArtifact(name: string) {
  const raw = readFileSync(resolve(ROOT, `artifacts/contracts/mocks/${name}.sol/${name}.json`), "utf-8");
  const { abi, bytecode } = JSON.parse(raw);
  return { abi, bytecode: bytecode as Hex };
}

export interface MockGovernanceContracts {
  ldo: Contract<typeof MiniMeToken_ABI>;
  voting: Contract<typeof Voting_ABI>;
  tokenManager: Contract<typeof TokenManager_ABI>;
}

export async function deployMockGovernance(
  client: DevRpcClient,
  deployer: Address,
): Promise<MockGovernanceContracts> {
  const mockERC20 = loadArtifact("MockERC20");
  const mockVoting = loadArtifact("MockVoting");
  const mockTokenManager = loadArtifact("MockTokenManager");

  const ldoAddress = await client.deployContract(
    { abi: mockERC20.abi, bytecode: mockERC20.bytecode, args: ["Lido DAO Token", "LDO"] },
    { from: deployer },
  );

  const voteTime = 3600n; // 1 hour
  const votingAddress = await client.deployContract(
    { abi: mockVoting.abi, bytecode: mockVoting.bytecode, args: [voteTime] },
    { from: deployer },
  );

  const tokenManagerAddress = await client.deployContract(
    { abi: mockTokenManager.abi, bytecode: mockTokenManager.bytecode, args: [] },
    { from: deployer },
  );

  return {
    ldo: contract(MiniMeToken_ABI, ldoAddress, "LDO"),
    voting: contract(Voting_ABI, votingAddress, "MockVoting"),
    tokenManager: contract(TokenManager_ABI, tokenManagerAddress, "MockTokenManager"),
  };
}
