import { expect } from "chai";
import sinon from "sinon";
import { OmnibusActionMeta } from "./omnibus-action-meta";
import { NetworkName } from "../networks";
import { LidoEthContracts } from "../lido";

describe("OmnibusActionMeta", () => {
  class TestAction extends OmnibusActionMeta<{ title?: string }> {}

  let testAction: TestAction;
  const mockNetwork: NetworkName = "mainnet";
  const mockContracts: Partial<LidoEthContracts> = {};

  beforeEach(() => {
    testAction = new TestAction({ title: "Test Action" });
  });

  it("should return provided title", () => {
    expect(testAction.title).to.equal("Test Action");
  });

  it("should throw error if title is not provided and title method not implemented", () => {
    const actionWithoutTitle = new TestAction({});
    expect(() => actionWithoutTitle.title).to.throw(
      `Action ${actionWithoutTitle.constructor.name} failed. You should provide the title in the input or implement the title method by yourself.`,
    );
  });

  it("should throw error if network context is not set", () => {
    expect(() => testAction.network).to.throw("The context wasn't set");
  });

  it("should throw error if contracts context is not set", () => {
    expect(() => testAction.contracts).to.throw("The context wasn't set");
  });

  it("should correctly set network and contracts context", () => {
    testAction.init(mockNetwork, mockContracts as LidoEthContracts);
    expect(testAction.network).to.equal(mockNetwork);
    expect(testAction.contracts).to.deep.equal(mockContracts);
  });

  describe("Lifecycle hooks", () => {
    let mockCtx: any;

    beforeEach(() => {
      mockCtx = {
        it: sinon.stub(),
        assert: sinon.stub(),
        provider: {},
      };
      testAction.init(mockNetwork, mockContracts as LidoEthContracts);
    });

    it("before hook should execute without errors", async () => {
      await expect(testAction.before(mockCtx)).to.not.be.rejected;
    });

    it("after hook should execute without errors", async () => {
      await expect(testAction.after(mockCtx)).to.not.be.rejected;
    });
  });
});
