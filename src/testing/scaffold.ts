import * as prettier from "prettier";
import fs from "node:fs/promises";
import path from "path";
import { Omnibus } from "../omnibuses/omnibus";
import networks, { NetworkName } from "../networks";
import { JsonRpcProvider } from "ethers";
import { ActionTestContext } from "./contracts";
import Handlebars from "handlebars";

const url = networks.localRpcUrl("eth");
const provider = new JsonRpcProvider(url);
const name = process.argv[2];
const omnibus: Omnibus<NetworkName> = require(path.join(process.cwd(), `omnibuses/${name}.ts`)).default;

export const scaffold = async () => {
  omnibus.init(provider);

  const context: ActionTestContext = {
    imports: [],
    globalValues: {},
    localValues: [],
    beforeChecks: [],
    beforePreps: [],
    testSuites: [],
  };

  // Gathering context
  for (const action of omnibus.actions) {
    const actionTestContext = await action.getTestContext();
    if (!actionTestContext) {
      continue;
    }

    if (actionTestContext.imports && actionTestContext.imports.length > 0) {
      context.imports!.push(...actionTestContext.imports);
    }

    context.globalValues = { ...context.globalValues, ...actionTestContext.globalValues };

    if (actionTestContext.beforeChecks && actionTestContext.beforeChecks.length > 0) {
      context.beforeChecks = [...context.beforeChecks!, ...actionTestContext.beforeChecks];
    }

    if (actionTestContext.localValues && actionTestContext.localValues.length) {
      context.localValues = [...context.localValues!, ...actionTestContext.localValues];
    }

    if (actionTestContext.beforePreps && actionTestContext.beforePreps.length > 0) {
      context.beforePreps = [...context.beforePreps!, ...actionTestContext.beforePreps];
    }

    if (actionTestContext.testSuites && actionTestContext.testSuites.length > 0) {
      context.testSuites = [...context.testSuites!, ...actionTestContext.testSuites];
    }
  }

  await render(context);
};

const render = async (context: Object) => {
  // Render
  const template = await fs.readFile(path.join(__dirname, `./template.hbs`));
  const result = Handlebars.compile(template.toString())({ ...context, name });

  // Fix styles
  const options = await prettier.resolveConfig(path.join(process.cwd(), `.prettierrc`));
  const formatted = await prettier.format(result, { ...options, parser: "babel-ts" });

  // Write down
  await fs.writeFile(path.join(process.cwd(), `omnibuses/${name}.generated.spec.ts`), formatted);
};

(async () => {
  await scaffold();
})();
