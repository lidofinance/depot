import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import prompt, { promptDeps } from "../../src/common/prompt";

chai.use(chaiAsPromised);
const { assert } = chai;

describe("prompt", () => {
  afterEach(() => sinon.restore());

  it("continues when an operation is confirmed", async () => {
    sinon.stub(promptDeps, "toggle").resolves(true);

    await prompt.confirmOrAbort("Deploy?");
  });

  it("aborts when an operation is rejected", async () => {
    sinon.stub(promptDeps, "toggle").resolves(false);

    await assert.isRejected(prompt.confirmOrAbort("Deploy?"), /Operation was aborted by the user/);
  });

  it("skips the prompt when auto-confirmation is enabled", async () => {
    const toggle = sinon.stub(promptDeps, "toggle");

    await prompt.confirmOrAbort("Deploy?", true);

    sinon.assert.notCalled(toggle);
  });
});
