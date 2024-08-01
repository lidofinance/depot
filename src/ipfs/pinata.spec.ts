import pinataSDK from "@pinata/sdk";
import { uploadToPinata } from "./pinata";
import sinon from "sinon";
import { expect } from "chai";
import { afterEach } from "mocha";

describe("Uploading to Pinata", () => {
  const mockPinataToken = "mockToken";
  let pinStub: sinon.SinonStub;

  beforeEach(() => {
    pinStub = sinon.stub(pinataSDK.prototype, "pinFileToIPFS");
  });

  afterEach(() => {
    pinStub.restore();
  });

  it("should upload text to Pinata and return the IPFS hash", async () => {
    const mockResult = { IpfsHash: "mockHash" };
    pinStub.resolves(mockResult as any);

    const result = await uploadToPinata("testText", "testFileName", mockPinataToken);

    expect(pinStub.calledOnce).to.be.true;
    expect(result).to.equal("mockHash");
  });

  it("should throw an error if upload to Pinata fails", async () => {
    const mockPinataToken = "mockToken";
    const mockError = new Error("Upload failed");
    pinStub.rejects(mockError);

    await expect(uploadToPinata("testText", "testFileName", mockPinataToken)).to.be.rejectedWith(
      "Failed to upload to Pinata: Error: Upload failed",
    );
  });
});
