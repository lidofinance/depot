import { uploadDescription } from "./upload-description";
import { expect } from "chai";
import sinon from "sinon";
import * as pinata from "./pinata";
import { after } from "mocha";

describe("uploadDescription", () => {
  after(() => {
    sinon.restore();
  });

  it("should skip if omnibus description is empty", async () => {
    const consoleWarnStub = sinon.stub(console, "warn");

    const cid = await uploadDescription("testOmnibus", "", { pinataToken: "mockPinataToken" });

    expect(cid).to.be.undefined;
    expect(consoleWarnStub.calledWith("Omnibus description is empty. Skipping...")).to.be.true;
  });

  it("should log error if pinata token is not provided", async () => {
    const consoleErrorStub = sinon.stub(console, "error");

    const cid = await uploadDescription("testOmnibus", "Test description", {});

    expect(cid).to.be.undefined;
    expect(
      consoleErrorStub.calledWith(
        "Pinata token is missing, upload is impossible. Set PINATA_TOKEN env variable to upload description to IPFS. You can create new one here: https://app.pinata.cloud/developers/api-keys",
      ),
    ).to.be.true;
  });

  it("should upload description to IPFS and log CID", async () => {
    const mockCid = "randomCID";
    const uploadToPinataMock: sinon.SinonStub = sinon.stub(pinata, "uploadToPinata").resolves(mockCid);

    await uploadDescription("testOmnibus", "Test description", { pinataToken: "mockPinataToken" });

    expect(uploadToPinataMock.calledWith("Test description", "testOmnibus_description.md")).to.be.true;
  });
});
