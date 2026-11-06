import { assert } from "chai";
import hre from "hardhat";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { Address } from "viem";

import { HexStrPrefixed } from "@/src/common/bytes";
import { Omnibus } from "@/src/omnibuses";
import { Contract } from "@/src/contracts";
import contractExample from "@/omnibuses/examples/_example_contract_omnibus/_example_contract_omnibus";
import { decodeSubmitProposalMetadata, isSubmitProposalCall } from "@/src/omnibuses/omnibus-contract-calls";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";
import { DevRpcClient, RpcClient } from "@/src/network";
import { deployOmnibusForLaunch, prepareOmnibus } from "@/tasks/omnibuses";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";

describe("production omnibus deployment (integration)", function () {
  let devClient: DevRpcClient;
  let client: RpcClient;
  let deployer: Address;
  let snapshotId: HexStrPrefixed;
  let tempDir: string | undefined;

  before(async function () {
    devClient = await createInProcessDevRpcClient();
    client = new RpcClient("mainnet", devClient.viemClient);
    [deployer] = await devClient.getAccounts();
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
  });

  it("prepares the custom deployment with contract metadata independent of item titles", async function () {
    const omnibus = Omnibus.create<"mainnet", Record<string, Contract>>({
      network: "mainnet",
      upgrade: false,
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

    tempDir = await mkdtemp(path.resolve("omnibuses/examples/_test_production_"));
    const name = path.basename(tempDir);
    const markdown = await readFile(
      "omnibuses/examples/_example_contract_omnibus/_example_contract_omnibus.md",
      "utf-8",
    );
    await writeFile(path.join(tempDir, `${name}.md`), markdown.replace(metadata, `${metadata} `));
    const reloaded = Omnibus.create({
      network: "mainnet",
      upgrade: false,
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
    const omnibus = Omnibus.create({ network: "mainnet", upgrade: false, testVote: async () => {} });
    const deploy = sinon.spy(client, "deployContract");
    await rejects(
      deployOmnibusForLaunch(hre, client, omnibus, "MockVoting", { from: deployer }),
      /Constructor.*takes arguments/,
    );
    sinon.assert.notCalled(deploy);
  });
});
