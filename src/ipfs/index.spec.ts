import * as pinata from "./pinata";
import sinon from "sinon";
import { uploadToIpfs } from "./index";
import { expect } from "chai";

describe("IPFS", () => {
  it("should upload text to Pinata and return the result", async () => {
    const mockPinataToken = "mockToken";
    const mockResult = "mockHash";
    sinon.stub(process, "env").value({ PINATA_TOKEN: mockPinataToken });
    const uploadStub = sinon.stub(pinata, "uploadToPinata").resolves(mockResult);

    const result = await uploadToIpfs("testText", "testFileName");

    expect(uploadStub.calledWith("testText", "testFileName", mockPinataToken)).to.be.true;
    expect(result).to.deep.equal(mockResult);
    uploadStub.restore();
  });

  it("should throw an error if PINATA_TOKEN is not set", async () => {
    sinon.stub(process, "env").value({ PINATA_TOKEN: undefined });

    await expect(uploadToIpfs("testText", "testFileName")).to.be.rejectedWith("PINATA_TOKEN is not set");
  });
});
