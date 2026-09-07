import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Address } from "../common/types";
import { NetworkName } from "../network";
import { fetchAbiFromEtherscan, lookupAddressInRegistry, readAbiFromFile, ResolvedAbi } from "./abi-source";
import { renderAbiTs } from "./render-abi-ts";
import { renderSolInterface } from "./render-sol-interface";

export const ABI_DIR = "abi";
export const INTERFACES_DIR = "contracts/interfaces";
export const SUPPORTED_NETWORKS: NetworkName[] = ["mainnet", "hoodi"];

export function isSupportedNetwork(value: string): value is NetworkName {
  return SUPPORTED_NETWORKS.some((network) => network === value);
}

export interface AbiSyncParams {
  /** PascalCase; drives `abi/<name>.abi.ts`, `I<name>.sol` and the `<name>_ABI` export. */
  name: string;
  networkName: NetworkName;
  /** Defaults to the constant of the same name in `contracts/addresses/`. */
  address?: Address;
  /** Local ABI JSON instead of Etherscan (unverified contracts). */
  fromFile?: string;
  /** Restrict the Solidity interface to these methods. */
  methods?: string[];
  skipSol?: boolean;
  /** Use the proxy's own ABI instead of following it to the implementation. */
  proxyAbi?: boolean;
}

export interface AbiSyncResult {
  source: string;
  contractName: string;
  abiPath: string;
  solPath: string | null;
}

const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const execFileAsync = promisify(execFile);

export const deps = {
  resolveAbi: async (params: AbiSyncParams): Promise<ResolvedAbi> => {
    if (params.fromFile) {
      return readAbiFromFile(params.fromFile);
    }
    const address = params.address ?? (await lookupAddressInRegistry(params.networkName, params.name));
    return fetchAbiFromEtherscan(params.networkName, address, { proxyAbi: params.proxyAbi });
  },
  writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content),
  // CI checks Solidity with `forge fmt`; formatting happens before anything is written, so a missing
  // Foundry leaves no half-written interface behind.
  formatSolidity: async (code: string): Promise<string> => {
    const running = execFileAsync("forge", ["fmt", "--raw", "-"]);
    running.child.stdin?.end(code);
    try {
      const { stdout } = await running;
      return stdout;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`forge fmt failed (Foundry must be installed): ${message}`);
    }
  },
};

/** Writes `abi/<Name>.abi.ts` (full ABI) and `contracts/interfaces/I<Name>.sol` (state-changing methods) from one ABI. */
export async function syncAbi(params: AbiSyncParams): Promise<AbiSyncResult> {
  if (!NAME_PATTERN.test(params.name)) {
    throw new Error(`Name "${params.name}" must be PascalCase, e.g. "StakingRouter"`);
  }

  const resolved = await deps.resolveAbi(params);

  const abiPath = path.join(ABI_DIR, `${params.name}.abi.ts`);
  const abiModule = await renderAbiTs(params.name, resolved.abi, {
    contractName: resolved.contractName,
    source: resolved.source,
  });

  let solPath: string | null = null;
  let solInterface: string | null = null;
  if (!params.skipSol) {
    solPath = path.join(INTERFACES_DIR, `I${params.name}.sol`);
    const rendered = renderSolInterface(`I${params.name}`, resolved.abi, {
      methods: params.methods,
      source: resolved.source,
    });
    solInterface = await deps.formatSolidity(rendered);
  }

  await deps.writeFile(abiPath, abiModule);
  if (solPath && solInterface) {
    await deps.writeFile(solPath, solInterface);
  }

  return { source: resolved.source, contractName: resolved.contractName, abiPath, solPath };
}
