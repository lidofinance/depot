import { assert } from "chai";

import { renderDefaultOmnibusDeployment, renderVoteId } from "@/src/omnibuses/omnibus-deployment";

const OMNIBUS_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

describe("default omnibus deployment", () => {
  const wrapper = [
    `import { Omnibus } from "../../src/omnibuses";`,
    ``,
    `export default Omnibus.create({`,
    `  network: "mainnet",`,
    `  upgrade: false,`,
    `  testVote: async () => {},`,
    `});`,
    ``,
  ].join("\n");

  it("refuses to overwrite an existing deployment section", () => {
    const deployedWrapper = wrapper.replace(
      `  network: "mainnet",`,
      `  network: "mainnet",\n  deployment: { omnibus: Omnibus.deployedContract("${OMNIBUS_ADDRESS}") },`,
    );

    assert.throws(
      () => renderDefaultOmnibusDeployment(deployedWrapper, OMNIBUS_ADDRESS),
      /already contains a "deployment" section/,
    );
  });
});

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
