import { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { RpcClient } from "../../network";
import { Omnibus } from "../omnibus";
import { buildGeneratorModel } from "./model";
import { renderOmnibusSolidity } from "./render-solidity";
import { omnibusNameToContractName } from "./utils";
import { Address } from "../../common/types";
import { runHardhatTask } from "../../hardhat/run-task";

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type GenerateOmnibusContractParams = {
  hre: HardhatRuntimeEnvironment;
  omnibus: Omnibus;
  omnibusName: string;
  contractName?: string;
  force?: boolean;
  formatter?: "prettier" | "forge" | "none";
  rootDir?: string;
};

export async function generateOmnibusContractFile({
  hre,
  omnibus,
  omnibusName,
  contractName,
  force = false,
  formatter = "forge",
  rootDir = path.resolve(__dirname, "..", "..", ".."),
}: GenerateOmnibusContractParams) {
  if (omnibus.hasDeployMethod() && !omnibus.getDeployment()) {
    await resolveDeploymentForContractGeneration(omnibus, hre);
  }

  const calls = omnibus.getCalls();
  const generatedContractName = contractName ?? omnibusNameToContractName(omnibusName);
  const generatedFileName = `${generatedContractName}.sol`;
  const generatedFilePath = path.resolve(rootDir, "omnibuses", omnibusName, generatedFileName);
  const omnibusScriptPath = path.resolve(rootDir, "omnibuses", omnibusName, `${omnibusName}.ts`);

  if (!force) {
    let fileExists = false;
    try {
      await fs.access(generatedFilePath);
      fileExists = true;
    } catch {
      // file doesn't exist
    }
    if (fileExists) {
      throw new Error(`File "${generatedFilePath}" already exists. Use "--force" to overwrite it`);
    }
  }

  const preferredNamesByAddress = await extractTopLevelAddressConstHints(omnibusScriptPath);
  const model = buildGeneratorModel({ omnibus, calls, preferredNamesByAddress });
  const output = await renderOmnibusSolidity({
    contractName: generatedContractName,
    omnibus,
    calls,
    model,
  });

  await fs.writeFile(generatedFilePath, output, { encoding: "utf-8" });

  if (formatter !== "none") {
    await formatSolidityFile(generatedFilePath, rootDir, formatter);
  }

  return { generatedFilePath, generatedContractName };
}

async function resolveDeploymentForContractGeneration(omnibus: Omnibus, hre: HardhatRuntimeEnvironment) {
  const omnibusDirPath = path.resolve(__dirname, "..", "..", "..", "omnibuses", omnibus.name);
  const omnibusSolidityFiles = await fs
    .readdir(omnibusDirPath)
    .then((entries) => entries.filter((entry) => entry.endsWith(".sol") && !entry.endsWith(".t.sol")))
    .then((entries) => entries.map((entry) => path.relative(process.cwd(), path.join(omnibusDirPath, entry))));

  if (omnibusSolidityFiles.length === 0) {
    throw new Error(`No Solidity contracts found in omnibus folder: ${omnibusDirPath}`);
  }

  await runHardhatTask(hre, "build", {
    quiet: true,
    noTests: true,
    files: omnibusSolidityFiles,
  });

  let addressCounter = 1n;
  const fakeClient: Pick<RpcClient, "deployContract"> = {
    // async required by RpcClient.deployContract interface
    // eslint-disable-next-line @typescript-eslint/require-await
    deployContract: async () => {
      const address: Address = `0x${addressCounter.toString(16).padStart(40, "0")}`;
      addressCounter++;
      return address;
    },
  };

  const fakeFrom = "0x0000000000000000000000000000000000000001";

  try {
    await omnibus.deployOmnibusContracts(hre.artifacts, fakeClient as RpcClient, { from: fakeFrom });
  } catch (error) {
    throw new Error(
      `Unable to resolve deployment for omnibus generation without RPC: ${(error as Error).message}. ` +
        `Add "deployment" section manually in omnibus script and retry.`,
    );
  }
}

async function formatSolidityFile(filePath: string, rootDir: string, formatter: "prettier" | "forge") {
  if (formatter === "prettier") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicImport = new Function("m", "return import(m)") as (moduleName: string) => Promise<any>;
      const prettier = await dynamicImport("prettier");
      const prettierPluginSolidity = await dynamicImport("prettier-plugin-solidity");
      const source = await fs.readFile(filePath, "utf-8");
      const formatted = await prettier.format(source, {
        parser: "slang",
        printWidth: 120,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plugins: [(prettierPluginSolidity as any).default ?? prettierPluginSolidity],
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await fs.writeFile(filePath, formatted, { encoding: "utf-8" });
      return;
    } catch (error) {
      const message = (error as Error).message ?? "unknown error";
      throw new Error(
        `Failed to format generated contract with prettier: ${message}. Use "--formatter none" to skip formatting.`,
      );
    }
  }

  try {
    await execFile("forge", ["fmt", filePath], { cwd: rootDir });
  } catch (error) {
    const message = (error as Error).message ?? "unknown error";
    throw new Error(
      `Failed to format generated contract with forge fmt: ${message}. Use "--formatter none" to skip formatting.`,
    );
  }
}

async function extractTopLevelAddressConstHints(omnibusScriptPath: string): Promise<Map<string, string>> {
  const hints = new Map<string, string>();
  let content = "";
  try {
    content = await fs.readFile(omnibusScriptPath, "utf-8");
  } catch {
    return hints;
  }

  const constAddressPattern =
    /^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["'](0x[a-fA-F0-9]{40})["']\s*(?:as const)?\s*;/gm;

  for (const match of content.matchAll(constAddressPattern)) {
    const constName = match[1];
    const address = match[2];
    if (!constName || !address) {
      continue;
    }
    hints.set(address.toLowerCase(), constName);
  }

  return hints;
}
