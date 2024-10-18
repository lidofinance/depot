import { uploadToPinata } from "./pinata";
import sinon from "sinon";
import { expect } from "chai";
import * as pinata from "./utils";

describe("Uploading to Pinata", () => {
  let pinStub: sinon.SinonStub;
  const fileStub = sinon.stub();
  const mockPinataToken = "mockToken";
  const testFile = new File(["testText"], "testFileName", { type: "text/markdown" });

  before(() => {
    pinStub = sinon.stub(pinata, "getPinata").returns({ upload: { file: fileStub } } as any);
  });

  after(() => {
    sinon.restore();
  });

  it("should upload text to Pinata and return the IPFS hash", async () => {
    const mockResult = { IpfsHash: "mockHash" };
    fileStub.resolves(mockResult as any);

    const result = await uploadToPinata(testFile, mockPinataToken);

    expect(pinStub.calledOnce).to.be.true;
    expect(result).to.equal("mockHash");
  });

  it("should throw an error if upload to Pinata fails", async () => {
    const mockPinataToken = "mockToken";
    const mockError = new Error("Upload failed");
    fileStub.rejects(mockError);

    await expect(uploadToPinata(testFile, mockPinataToken)).to.be.rejectedWith("Upload failed");
  });
});
