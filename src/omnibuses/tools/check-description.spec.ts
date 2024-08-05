import * as actions from "../../task-actions/upload-description";
import prompt from "../../common/prompt";
import sinon from "sinon";
import { assert } from "chai";
import { afterEach } from "mocha";
import { checkDescription } from "./check-description";

describe("Omnibuses utils", () => {
  let mockUploadDescription: sinon.SinonStub;
  let mockConfirm: sinon.SinonStub;

  before(() => {
    mockUploadDescription = sinon.stub(actions, "uploadDescription").resolves("QmTestCID");
    mockConfirm = sinon.stub(prompt, "confirm");
  });

  afterEach(() => {
    mockUploadDescription.reset();
    mockConfirm.reset();
  });

  after(() => {
    mockUploadDescription.restore();
    mockConfirm.restore();
  });

  it("uploads description to IPFS if not already uploaded", async () => {
    const mockOmnibus = {
      description: "Test description",
      descriptionCID: null,
      name: "TestOmnibus",
      titles: ["Title1", "Title2"],
    } as any;

    await checkDescription(mockOmnibus);

    assert.equal(mockOmnibus.descriptionCID, "QmTestCID");
    assert.isTrue(mockUploadDescription.calledOnce);
  });

  it("skips uploading if description is already uploaded", async () => {
    const mockOmnibus = {
      description: "Test description",
      descriptionCID: "QmExistingCID",
      name: "TestOmnibus",
      titles: ["Title1", "Title2"],
    } as any;

    await checkDescription(mockOmnibus);

    assert.isTrue(mockUploadDescription.notCalled);
  });

  it("skips uploading if description is empty", async () => {
    const mockOmnibus = {
      description: "",
      descriptionCID: null,
      name: "TestOmnibus",
      titles: ["Title1", "Title2"],
    } as any;

    await checkDescription(mockOmnibus);

    assert.isTrue(mockUploadDescription.notCalled);
  });

  it("uses default description if upload fails and user confirms", async () => {
    const mockOmnibus = {
      description: "Test description",
      descriptionCID: null,
      name: "TestOmnibus",
      titles: ["Title1", "Title2"],
    } as any;
    mockUploadDescription.rejects(new Error("Upload failed"));
    mockConfirm.resolves(true);

    await checkDescription(mockOmnibus);

    assert.isNull(mockOmnibus.descriptionCID);
    assert.isTrue(mockUploadDescription.calledOnce);
    assert.isTrue(mockConfirm.calledOnce);
  });

  it("throws error if upload fails and user does not confirm", async () => {
    const mockOmnibus = {
      description: "Test description",
      descriptionCID: null,
      name: "TestOmnibus",
      titles: ["Title1", "Title2"],
    } as any;
    mockUploadDescription.rejects(new Error("Upload failed"));
    mockConfirm.resolves(false);

    await assert.isRejected(checkDescription(mockOmnibus), "The omnibus launch was canceled");

    assert.isTrue(mockUploadDescription.calledOnce);
    assert.isTrue(mockConfirm.calledOnce);
  });
});
