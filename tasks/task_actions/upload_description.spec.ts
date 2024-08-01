import path from "path";
import { uploadDescription } from "./upload_description";
import { expect } from "chai";
import sinon from "sinon";
import { HardhatRuntimeEnvironment, RunSuperFunction } from "hardhat/types";
import * as ipfs from "../../src/ipfs";
import module from "module";

describe("uploadDescription", () => {
  const consoleLogStub = sinon.stub(console, "log");
  let requireStub: sinon.SinonStub;

  before(() => {
    sinon.stub(path, "join").returns("mockPath");
    requireStub = sinon.stub(module.prototype, "require");
  });

  it("should abort if omnibus is already executed", async () => {
    const mockOmnibus = { isExecuted: true, description: "Test description" };
    requireStub.returns({ default: mockOmnibus });

    await uploadDescription(
      { name: "testOmnibus" },
      {} as unknown as HardhatRuntimeEnvironment,
      {} as unknown as RunSuperFunction<any>,
    );

    expect(consoleLogStub.calledWith("Omnibus already was executed. Aborting...")).to.be.true;
  });

  it("should skip if omnibus description is empty", async () => {
    const mockOmnibus = { isExecuted: false, description: "" };
    requireStub.returns({ default: mockOmnibus });

    await uploadDescription(
      { name: "testOmnibus" },
      {} as unknown as HardhatRuntimeEnvironment,
      {} as unknown as RunSuperFunction<any>,
    );

    expect(consoleLogStub.calledWith("Omnibus description is empty. Skipping...")).to.be.true;
  });

  it("should upload description to IPFS and log CID", async () => {
    const mockOmnibus = { isExecuted: false, description: "Test description" };
    const mockCid = "mockCid";
    requireStub.returns({ default: mockOmnibus });
    const uploadToIPFSMock: sinon.SinonStub = sinon.stub(ipfs, "uploadToIpfs").resolves(mockCid);

    await uploadDescription(
      { name: "testOmnibus" },
      {} as unknown as HardhatRuntimeEnvironment,
      {} as unknown as RunSuperFunction<any>,
    );

    expect(uploadToIPFSMock.calledWith("Test description", "testOmnibus_description.md")).to.be.true;
    expect(consoleLogStub.calledWithMatch(/Omnibus description successfully uploaded to IPFS with CID:/)).to.be.true;
    expect(consoleLogStub.calledWithMatch(new RegExp(`│ ${mockCid} │`))).to.be.true;
  });
});
