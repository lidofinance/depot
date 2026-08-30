import { assert } from "chai";

import { renderDefaultOmnibusDeployment } from "../../src/omnibuses/omnibus-deployment";

const OMNIBUS_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

describe("default omnibus deployment", () => {
  const wrapper = [
    `import { Omnibus } from "../../src/omnibuses";`,
    ``,
    `export default Omnibus.create({`,
    `  network: "mainnet",`,
    `  testVote: async () => {},`,
    `});`,
    ``,
  ].join("\n");

  it("adds an explicit deployment.omnibus entry to the wrapper", () => {
    const rendered = renderDefaultOmnibusDeployment(wrapper, OMNIBUS_ADDRESS);

    assert.include(
      rendered,
      [
        `export default Omnibus.create({`,
        `  deployment: {`,
        `    omnibus: Omnibus.deployedContract("${OMNIBUS_ADDRESS}"),`,
        `  },`,
        ``,
        `  network: "mainnet",`,
      ].join("\n"),
    );
  });

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
