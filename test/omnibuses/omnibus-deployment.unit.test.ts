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
        `    omnibus: Omnibus.deployedContract(DEPLOYED_OMNIBUS_ADDRESS),`,
        `  },`,
        ``,
        `  network: "mainnet",`,
      ].join("\n"),
    );
    assert.include(rendered, `const DEPLOYED_OMNIBUS_ADDRESS = "${OMNIBUS_ADDRESS}";`);
  });

  it("preserves an existing address binding and chooses an unused name for the deployment", () => {
    const source = `const DEPLOYED_OMNIBUS_ADDRESS = "${OMNIBUS_ADDRESS}";\n${wrapper}`;
    const rendered = renderDefaultOmnibusDeployment(source, OMNIBUS_ADDRESS);
    assert.include(rendered, `const DEPLOYED_OMNIBUS_ADDRESS_2 = "${OMNIBUS_ADDRESS}";`);
    assert.include(rendered, "Omnibus.deployedContract(DEPLOYED_OMNIBUS_ADDRESS_2)");
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
