import { uploadToPinata } from "./pinata";
import sinon from "sinon";
import { expect } from "chai";
import * as pinata from "./utils";

describe("Uploading to Pinata", () => {
  const mockPinataToken = "mockToken";
  let pinStub: sinon.SinonStub;
  const fileStub = sinon.stub();

  before(() => {
    pinStub = sinon.stub(pinata, "getPinata").returns({ upload: { file: fileStub } } as any);
  });

  after(() => {
    sinon.restore();
  });

  it("should upload text to Pinata and return the IPFS hash", async () => {
    const mockResult = { IpfsHash: "mockHash" };
    fileStub.resolves(mockResult as any);

    const result = await uploadToPinata("testText", "testFileName", mockPinataToken);

    expect(pinStub.calledOnce).to.be.true;
    expect(result).to.equal("mockHash");
  });

  it("should throw an error if upload to Pinata fails", async () => {
    const mockPinataToken = "mockToken";
    const mockError = new Error("Upload failed");
    fileStub.rejects(mockError);

    await expect(uploadToPinata("testText", "testFileName", mockPinataToken)).to.be.rejectedWith(
      "Failed to upload to Pinata: Error: Upload failed",
    );
  });
});
