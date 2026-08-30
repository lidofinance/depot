import { assert } from "chai";
import hre from "hardhat";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Address, getAddress } from "viem";

import { lifecycleDeps, startAragonVote } from "../../src/aragon-votes-tools/lifecycle";
import { HexStrPrefixed } from "../../src/common/bytes";
import { Omnibus } from "../../src/omnibuses";
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
    await devClient.revert(snapshotId);
    if (tempDir) {
      await rm(tempDir, { recursive: true });
      tempDir = undefined;
    }
  });

  it("deploys, reloads the recorded contract, prepares it, and launches a vote", async function () {
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
    tempDir = await mkdtemp(path.join(tmpdir(), "depot-production-deployment-"));
    const wrapperPath = path.join(tempDir, "omnibus.ts");
    await writeFile(wrapperPath, wrapper, "utf-8");
    await recordDefaultOmnibusDeployment(wrapperPath, deployment.omnibus.address);
    const module = (await import(`${pathToFileURL(wrapperPath).href}?smoke=${Date.now()}`)) as { default: Omnibus };
    const omnibus = module.default;
    omnibus.setName("_example_regular_omnibus");

    assert.equal(omnibus.getDeployment()?.omnibus.address, getAddress(deployment.omnibus.address));

    await prepareOmnibus(hre, client, omnibus);
    const { voteId } = await startAragonVote(client, omnibus.getEvmScript(), omnibus.formatDescription(), {
      from: deployer,
    });
    const [open, executed] = await devClient.read(mocks.voting, "getVote", [voteId]);

    assert.isTrue(open);
    assert.isFalse(executed);
  });
});
