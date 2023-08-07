import prompts from "prompts";
import { task } from "hardhat/config";

import lido from "../src/lido";
import { Omnibus } from "../src/omnibus";

import { prepareAutopilot } from "../test/helpers/_voting";
import chalk from "chalk";
import { spawn } from "node:child_process";
import fetch from "node-fetch";
import { ParsedOmnibusCall } from "../src/omnibus/omnibus";
import accounts from "../src/keystore-accounts";
import providers from "../src/providers/providers-service";
import env from "../src/common/env";
import contractsService, { ContractsResolver, LabeledContract } from "../src/contracts";
import bytes from "../src/common/bytes";

async function spawnHardhatNode(networkName: NetworkName) {
  const localRpcUrl = env.LOCAL_RPC_URL();

  try {
    const response = await fetch(localRpcUrl, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "web3_clientVersion",
        params: [],
      }),
    });
    const data = await response.json();

    console.log(
      `Local node ${chalk.bold.green(data["result"])} detected on ${chalk.underline(localRpcUrl)}`,
    );
    return;
  } catch {}

  console.log("Spawning hardhat node...");
  // TODO: remove stubbed values
  const node = spawn("npx", [
    "hardhat",
    "node",
    "--port",
    "8545",
    `--fork`,
    providers.rpcUrl(networkName),
    `--fork-block-number`,
    "17572253",
  ]);

  node.stderr.on("data", (data) => {
    throw new Error(`Hardhat Node Error: ${data.toString()}`);
  });

  process.on("exit", function () {
    console.log("Exiting...");
    node.kill();
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Hardhat node is listening on port 8545...");
}

task("omnibus:run", "Runs the omnibus with given name")
  .addPositionalParam<string>("name", "Name of the omnibus to run")
  .addFlag("fork", "Should be used fork for the test run")
  .setAction(async ({ name, fork }) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
    if (fork) {
      await spawnHardhatNode(omnibus.network);
    }

    const evmScript = await omnibus.prepareEVMScript();

    const provider = providers.create(omnibus.network, { fork });

    const { contracts } = lido[omnibus.version](provider);

    const pilot = fork ? await prepareAutopilot(provider) : await accounts.unlock(provider);

    await printOmnibusPoints(omnibus, contractsService.resolver());

    const { isConfirmed } = await prompts(
      [
        {
          type: "confirm",
          name: "isConfirmed",
          message: "Continue?",
          initial: false,
        },
      ],
      {
        onCancel: () => {
          throw new Error("Process was interrupted by the user");
        },
      },
    );

    if (!isConfirmed) {
      console.log("Omnibus launch was canceled");
      return;
    }

    const tx = await contracts.tokenManager.connect(pilot).forward(evmScript);

    console.log("Omnibus transaction was sent:", tx.hash);
    console.log("Waiting transaction will be confirmed...");

    await tx.wait();
    console.log("Omnibus was launched successfully 🎉");
  });

const OSC = "\u001B]";
const BEL = "\u0007";
const SEP = ";";

function link(text: string, url: string) {
  return [OSC, "8", SEP, SEP, url, BEL, text, OSC, "8", SEP, SEP, BEL].join("");
}

async function printOmnibusPoints(omnibus: Omnibus, contractsResolver: ContractsResolver) {
  const parsed = await omnibus.parse();

  console.log("Points of voting:");
  for (let i = 0; i < parsed.length; ++i) {
    const contract = await contractsResolver.resolve(omnibus.network, parsed[i].call.address);

    console.log(`  Point ${i + 1}/${parsed.length}`);
    console.log(formatOmnibusPoint(parsed[i], contract, 2));
    console.log();
  }
}

function formatOmnibusPoint(
  point: ParsedOmnibusCall,
  contract: LabeledContract | null,
  padding?: number,
) {
  const description = chalk.bold.green(point.title);
  const contractName = chalk.magenta.bold(contract?.label || "UNVERIFIED");
  const contractNameWithAddress = `${contractName} (${point.call.address})`;
  const selector = bytes.slice(point.call.calldata, 0, 4);
  const methodFragment = contract?.getFunction(selector).getFragment();
  const methodName = chalk.magenta.bold(methodFragment?.name || selector);
  const methodArgs =
    methodFragment?.inputs.map((i) => chalk.yellow(i.type) + " " + i.name).join(", ") || "";
  const methodNameWithArgs = `${methodName}(${methodArgs})`;

  let args: string[] = [point.call.calldata];
  if (contract && methodFragment) {
    const parsedArgs = contract?.interface.decodeFunctionData(methodFragment!, point.call.calldata);
    args = [];
    for (let i = 0; i < methodFragment.inputs.length; ++i) {
      args.push(`${methodFragment.inputs[i].name} : ${parsedArgs[i]}`);
    }
  }

  const paddingLeft = "  ".repeat(padding || 0);

  return [
    paddingLeft + `Description: ${description}`,
    paddingLeft + `Contract: ${contractNameWithAddress}`,
    paddingLeft + `Method: ${methodNameWithArgs}`,
    paddingLeft + "Arguments:",
    ...args.map((arg) => "  " + paddingLeft + arg),
  ].join("\n");
}
