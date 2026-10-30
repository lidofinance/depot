import { assert } from "chai";

import ts from "typescript";
import path from "node:path";
import { readFileSync } from "node:fs";
import { OmnibusBase_ABI } from "@/abi/OmnibusBase.abi";
import { ExampleContractOmnibusVoteStateValidator_ABI } from "@/omnibuses/_example_contract_omnibus/_example_contract_omnibus.abi";
import { renderCustomOmnibusDeployment, renderDefaultOmnibusDeployment } from "@/src/omnibuses/omnibus-deployment";
import { lintVoteSources } from "@/src/omnibuses/address-lint";

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
    assert.isEmpty(lintVoteSources(new Map([["omnibus.ts", rendered]]), ["omnibus.ts"]));
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

describe("custom omnibus deployment", () => {
  it("typechecks when pasted into the existing custom-deploy wrapper", () => {
    const wrapperPath = path.resolve("omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts");
    const wrapper = readFileSync(wrapperPath, "utf-8");
    const contracts = {
      omnibus: {
        address: OMNIBUS_ADDRESS,
        label: "ExampleContractOmnibus",
        abi: [
          ...OmnibusBase_ABI,
          { type: "constructor", inputs: [{ name: "validator", type: "address" }], stateMutability: "nonpayable" },
        ],
      },
      voteStateValidator: {
        address: OMNIBUS_ADDRESS,
        label: "ExampleContractOmnibusVoteStateValidator",
        abi: ExampleContractOmnibusVoteStateValidator_ABI,
      },
    } as const;
    const parsed = ts.createSourceFile(wrapperPath, wrapper, ts.ScriptTarget.Latest, true);
    let deploy: ts.MethodDeclaration | undefined;
    function findDeploy(node: ts.Node): void {
      if (ts.isMethodDeclaration(node) && node.name.getText(parsed) === "deploy") {
        deploy = node;
      }
      ts.forEachChild(node, findDeploy);
    }
    findDeploy(parsed);
    if (!deploy) {
      throw new Error("Example wrapper must have a custom deploy callback");
    }
    const namedDeploy = deploy
      .getText(parsed)
      .replace("async deploy(", "async function deploy(")
      .replace("{ deployContract })", "{ deployContract }: DeployOmnibusContractCtx)");
    const patched = (wrapper.slice(0, deploy.getStart(parsed)) + "deploy" + wrapper.slice(deploy.end))
      .replace("Omnibus } from", "Omnibus, type DeployOmnibusContractCtx } from")
      .replace(
        "export default Omnibus.create({",
        `${namedDeploy}\n${renderCustomOmnibusDeployment(contracts)}\nexport default Omnibus.create({\n  deployment: DEPLOYED_CONTRACTS,`,
      );
    const config = ts.readConfigFile(path.resolve("tsconfig.json"), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
    function diagnostics(source: string): string[] {
      const host = ts.createCompilerHost(options);
      const getSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
        path.resolve(fileName) === wrapperPath
          ? ts.createSourceFile(fileName, source, languageVersion, true)
          : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      const program = ts.createProgram([wrapperPath], options, host);
      return ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    }
    assert.deepEqual(diagnostics(patched), diagnostics(wrapper));
  });

  it("preserves each deployed ABI and produces address-lintable contract handles", () => {
    const abi = [{ type: "function", name: "validate", inputs: [], outputs: [], stateMutability: "view" }] as const;
    const contracts = {
      omnibus: { address: OMNIBUS_ADDRESS, label: "CustomOmnibus", abi },
      validator: { address: OMNIBUS_ADDRESS, label: "Validator", abi },
    } as const;
    const source = renderCustomOmnibusDeployment(contracts);
    assert.isEmpty(lintVoteSources(new Map([["omnibus.ts", source]]), ["omnibus.ts"]));
    const javascript = ts.transpileModule(`${source}\nreturn DEPLOYED_CONTRACTS;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const deployment: unknown = new Function(javascript)();
    assert.deepEqual(deployment, contracts);
  });
});
