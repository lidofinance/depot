import { assert } from "chai";

import { renderVoteId } from "@/src/omnibuses/omnibus-deployment";

describe("recorded voteId", () => {
  const wrapper = `export default Omnibus.create({\n  voteId: undefined,\n  testVote: async () => {},\n});\n`;

  it("replaces an undefined voteId", () => {
    assert.equal(renderVoteId(wrapper, 7n), wrapper.replace("voteId: undefined", "voteId: 7"));
  });

  it("refuses to overwrite a recorded value", () => {
    assert.throws(
      () => renderVoteId(wrapper.replace("voteId: undefined", "voteId: 6"), 7n),
      /"voteId" must be undefined/,
    );
  });

  it("refuses an undefined voteId a later spread could override", () => {
    assert.throws(
      () => renderVoteId(`export default Omnibus.create({ voteId: undefined, ...base })`, 7n),
      /must follow every spread/,
    );
  });
});
