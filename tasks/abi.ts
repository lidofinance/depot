import chalk from "chalk";
import { task } from "hardhat/config";

import { syncAbi } from "../src/abi-sync";
import { parseAddress } from "../src/abi-sync/abi-source";
import { NetworkName } from "../src/network/network";

const NETWORKS: NetworkName[] = ["mainnet", "hoodi"];

interface AbiSyncTaskArgs {
  name: string;
  address: string;
  networkName: string;
  fromFile: string;
  methods: string;
  skipSol: boolean;
}

async function abiSyncAction(taskArgs: AbiSyncTaskArgs) {
  if (!NETWORKS.includes(taskArgs.networkName as NetworkName)) {
    throw new Error(`Unknown network "${taskArgs.networkName}", expected one of: ${NETWORKS.join(", ")}`);
  }

  const result = await syncAbi({
    name: taskArgs.name,
    networkName: taskArgs.networkName as NetworkName,
    address: taskArgs.address ? parseAddress(taskArgs.address) : undefined,
    fromFile: taskArgs.fromFile || undefined,
    methods: taskArgs.methods ? taskArgs.methods.split(",").map((method) => method.trim()) : undefined,
    skipSol: taskArgs.skipSol,
  });

  console.log(`${chalk.green("✔")} ${result.contractName} — ${result.source}`);
  console.log(`  ${result.abiPath}`);
  if (result.solPath) {
    console.log(`  ${result.solPath}`);
  }
}

export const abiTaskBuilders = [
  task("abi:sync", "Generate abi/<Name>.abi.ts and contracts/interfaces/I<Name>.sol from a verified ABI")
    .addPositionalArgument({ name: "name", description: 'PascalCase contract name, e.g. "StakingRouter"' })
    .addOption({
      name: "address",
      description: "Deployed address; defaults to the constant of the same name in contracts/addresses/",
      defaultValue: "",
    })
    .addOption({ name: "networkName", description: "mainnet | hoodi", defaultValue: "mainnet" })
    .addOption({
      name: "fromFile",
      description: "Read the ABI from a local JSON file instead of Etherscan (for unverified contracts)",
      defaultValue: "",
    })
    .addOption({
      name: "methods",
      description: "Comma-separated method names to keep in the Solidity interface (default: all state-changing)",
      defaultValue: "",
    })
    .addFlag({ name: "skipSol", description: "Only write the TypeScript ABI, no Solidity interface" })
    .setAction(() => Promise.resolve({ default: abiSyncAction })),
];
