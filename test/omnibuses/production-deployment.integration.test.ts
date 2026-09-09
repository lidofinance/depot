import { assert } from "chai";
import hre from "hardhat";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { pathToFileURL } from "node:url";
import { Address, getAddress } from "viem";

import { lifecycleDeps, startAragonVote } from "../../src/aragon-votes-tools/lifecycle";
import { HexStrPrefixed } from "../../src/common/bytes";
import { Omnibus } from "../../src/omnibuses";
import { Contract } from "../../src/contracts";
import contractExample from "../../omnibuses/_example_contract_omnibus/_example_contract_omnibus";
import { decodeSubmitProposalMetadata, isSubmitProposalCall } from "../../src/omnibuses/omnibus-contract-calls";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";
import { GovernanceContracts } from "../../src/omnibuses/governance-contracts";
import { DevRpcClient, RpcClient } from "../../src/network";
import { deployOmnibusForLaunch, prepareOmnibus, recordDefaultOmnibusDeployment } from "../../tasks/omnibuses";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";

describe("production omnibus deployment (integration)", function () {
  let devClient: DevRpcClient;
  let client: RpcClient;
  let mocks: MockGovernanceContracts;
  let deployer: Address;
  let snapshotId: HexStrPrefixed;
  let tempDir: string | undefined;
  let createdArchiveRoot: string | undefined;
  const archiveDirectory = path.resolve("omnibuses/_archive/mainnet");
  let originalLifecycleDeps: typeof lifecycleDeps.getGovernanceContracts;

  before(async function () {
    devClient = await createInProcessDevRpcClient();
    client = new RpcClient("mainnet", devClient.viemClient);
    [deployer] = await devClient.getAccounts();
    mocks = await deployMockGovernance(devClient, deployer);

    originalLifecycleDeps = lifecycleDeps.getGovernanceContracts;
    lifecycleDeps.getGovernanceContracts = () => mocks as unknown as GovernanceContracts;
  });

  after(function () {
    lifecycleDeps.getGovernanceContracts = originalLifecycleDeps;
  });

  beforeEach(async function () {
    snapshotId = await devClient.snapshot();
  });

  afterEach(async function () {
    sinon.restore();
    await devClient.revert(snapshotId);
    if (tempDir) {
      await rm(tempDir, { recursive: true });
      tempDir = undefined;
    }
    for (
      let directory = archiveDirectory;
      createdArchiveRoot && directory.length >= createdArchiveRoot.length;
      directory = path.dirname(directory)
    ) {
      await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") {
          throw error;
        }
      });
    }
    createdArchiveRoot = undefined;
  });

  it("deploys, reloads an archived recorded contract, prepares it, and launches a vote", async function () {
    const deployingOmnibus = Omnibus.create({
      network: "mainnet",
      testVote: async () => {},
    });
    const deployment = await deployOmnibusForLaunch(hre, client, deployingOmnibus, "MockOmnibus", {
      from: deployer,
    });

    const omnibusModuleUrl = pathToFileURL(path.resolve("src/omnibuses/index.ts")).href;
    const wrapper = [
      `import { Omnibus } from ${JSON.stringify(omnibusModuleUrl)};`,
      ``,
      `export default Omnibus.create({`,
      `  network: "mainnet",`,
      `  testVote: async () => {},`,
      `});`,
      ``,
    ].join("\n");
    createdArchiveRoot = await mkdir(archiveDirectory, { recursive: true });
    tempDir = await mkdtemp(path.join(archiveDirectory, "_test_production_"));
    const name = path.basename(tempDir);
    const wrapperPath = path.join(tempDir, `${name}.ts`);
    const solidity = await readFile("contracts/mocks/MockOmnibus.sol", "utf-8");
    await writeFile(path.join(tempDir, "MockOmnibus.sol"), solidity.replaceAll('"../', '"../../../../contracts/'));
    await writeFile(path.join(tempDir, `${name}.md`), "# Archived production deployment");
    await writeFile(wrapperPath, wrapper, "utf-8");
    await recordDefaultOmnibusDeployment(wrapperPath, deployment.omnibus.address);
    const module = (await import(`${pathToFileURL(wrapperPath).href}?smoke=${Date.now()}`)) as { default: Omnibus };
    const omnibus = module.default;
    omnibus.setName(name);

    assert.equal(omnibus.getDeployment()?.omnibus.address, getAddress(deployment.omnibus.address));

    await prepareOmnibus(hre, client, omnibus);
    const { voteId } = await startAragonVote(client, omnibus.getEvmScript(), omnibus.formatDescription(), {
      from: deployer,
    });
    const [open, executed] = await devClient.read(mocks.voting, "getVote", [voteId]);

    assert.isTrue(open);
    assert.isFalse(executed);
  });

  it("prepares the custom deployment with contract metadata independent of item titles", async function () {
    const omnibus = Omnibus.create<"mainnet", Record<string, Contract>>({
      network: "mainnet",
      deploy: ({ client: deployClient }) =>
        contractExample.deployOmnibusContracts(hre.artifacts, deployClient, { from: deployer }),
      testVote: async () => {},
    });
    omnibus.setName("_example_contract_omnibus");
    await prepareOmnibus(hre, devClient, omnibus);
    const deployment = omnibus.getDeployment();
    assert.isOk(deployment?.voteStateValidator.address);
    assert.isOk(deployment?.omnibus.address);
    const governance = getGovernanceContracts("mainnet");
    const proposalCall = omnibus
      .getContractVoteCalls()
      .find((call) => isSubmitProposalCall(call, governance.dualGovernance.address));
    if (!proposalCall || !deployment) {
      throw new Error("Prepared example must contain a deployment and a proposal");
    }
    const metadata = decodeSubmitProposalMetadata(proposalCall);
    assert.notEqual(metadata, proposalCall.title);
    const description = omnibus.formatDescription("ipfs://description");
    assert.include(description, `11. ${proposalCall.title}`);
    assert.include(description, "ipfs://description");
    const { receipt } = await startAragonVote(client, omnibus.getEvmScript(), description, { from: deployer });
    assert.isOk(receipt.transactionHash);

    tempDir = await mkdtemp(path.resolve("omnibuses/_test_production_"));
    const name = path.basename(tempDir);
    const markdown = await readFile("omnibuses/_example_contract_omnibus/_example_contract_omnibus.md", "utf-8");
    await writeFile(path.join(tempDir, `${name}.md`), markdown.replace(metadata, `${metadata} `));
    const reloaded = Omnibus.create({
      network: "mainnet",
      deployment,
      deploy: () => Promise.resolve(deployment),
      testVote: async () => {},
    });
    reloaded.setName(name);
    const launch = sinon.spy(client, "write");
    await rejects(prepareOmnibus(hre, client, reloaded), /Description of the proposal.*differs/);
    sinon.assert.notCalled(launch);

    const originalRead = client.read.bind(client);
    sinon.stub(client, "read").callsFake(async (contract, method, args) => {
      if (method === "getEVMScript") {
        return "0x00000001" as never;
      }
      return originalRead(contract, method, args);
    });
    await rejects(prepareOmnibus(hre, client, reloaded), /Unexpected EVM script/);
    sinon.assert.notCalled(launch);
  });

  it("rejects default deployment for contracts with constructor arguments", async function () {
    const omnibus = Omnibus.create({ network: "mainnet", testVote: async () => {} });
    const deploy = sinon.spy(client, "deployContract");
    await rejects(
      deployOmnibusForLaunch(hre, client, omnibus, "MockVoting", { from: deployer }),
      /Constructor.*takes arguments/,
    );
    sinon.assert.notCalled(deploy);
  });
});
