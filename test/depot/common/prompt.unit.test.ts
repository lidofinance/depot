import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import prompt, { promptDeps } from "@/src/common/prompt";

chai.use(chaiAsPromised);
const { assert } = chai;

describe("prompt", () => {
  afterEach(() => sinon.restore());

  it("aborts when an operation is rejected", async () => {
    sinon.stub(promptDeps, "toggle").resolves(false);

    await assert.isRejected(prompt.confirmOrAbort("Deploy?"), /Operation was aborted by the user/);
  });
});
