import fs from "node:fs/promises";
import path from "node:path";

import { Address } from "../common/types";
import { NetworkName } from "../network";
import { fetchAbiFromEtherscan, lookupAddressInRegistry, readAbiFromFile, ResolvedAbi } from "./abi-source";
import { renderAbiTs } from "./render-abi-ts";
import { renderSolInterface } from "./render-sol-interface";

export const ABI_DIR = "abi";
export const INTERFACES_DIR = "contracts/interfaces";

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
}

export interface AbiSyncResult {
  source: string;
  contractName: string;
  abiPath: string;
  solPath: string | null;
}

const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

export const deps = {
  resolveAbi: async (params: AbiSyncParams): Promise<ResolvedAbi> => {
    if (params.fromFile) {
      return readAbiFromFile(params.fromFile);
    }
    const address = params.address ?? (await lookupAddressInRegistry(params.networkName, params.name));
    return fetchAbiFromEtherscan(params.networkName, address);
  },
  writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content),
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
  await deps.writeFile(abiPath, abiModule);

  let solPath: string | null = null;
  if (!params.skipSol) {
    solPath = path.join(INTERFACES_DIR, `I${params.name}.sol`);
    const solInterface = await renderSolInterface(`I${params.name}`, resolved.abi, {
      methods: params.methods,
      source: resolved.source,
    });
    await deps.writeFile(solPath, solInterface);
  }

  return { source: resolved.source, contractName: resolved.contractName, abiPath, solPath };
}
