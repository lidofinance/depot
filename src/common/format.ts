import chalk from "chalk";
import type { Address, Stringable } from "./types";
import bytes, { HexStrPrefixed } from "./bytes";
import { CallEvmOpcodes, LogEvmOpcodes } from "../traces/evm-opcodes";
import { Contract, getFunctionAbi } from "../contracts/contracts";
import { AbiEvent, AbiParameter } from "abitype";

function address(address: Address) {
  return chalk.cyan.underline.italic(address);
}

function ok(str: string) {
  return chalk.greenBright(str);
}

function opcode(opcode: string) {
  opcode = opcode.toUpperCase();
  if (opcode === "DELEGATECALL") {
    opcode = "D·CALL";
  }
  if (opcode === "STATICCALL") {
    opcode = "S·CALL";
  }
  return chalk.bold.green(opcode.toUpperCase());
}

function argument(name: string, value: Stringable) {
  const valueString = value.toString();
  return chalk.yellow(name) + "=" + valueString.toString();
}

function label(label: string) {
  return chalk.magenta.bold(label);
}

function method(name: string, args = "", padding = "") {
  return (
    chalk.blue.italic(name) + chalk.blue.italic(`(\n${padding + "    "}`) + args + chalk.blue.italic(`\n${padding})`)
  );
}

function contract(name: string, addr: Address) {
  return chalk.magenta.bold(name) + chalk.magenta.bold("[") + address(addr) + chalk.magenta.bold("]");
}

function padLeft(padLength: number, padSymbol: string = "  ") {
  return padSymbol.repeat(padLength);
}

function padded(str: string, padLength: number = 1, padSymbol: string = "  ") {
  return padLeft(padLength, padSymbol) + str;
}

interface FormatUndecodedFunctionCallParams {
  address: Address;
  input: HexStrPrefixed;
  output?: HexStrPrefixed;
  callType?: CallEvmOpcodes;
  padLength?: number;
}

function formatRawFunctionCall(params: FormatUndecodedFunctionCallParams) {
  const padLength = params.padLength ?? 0;
  const functionSignature = `[${address(params.address)}::${params.input}]`;
  const functionResult = params.output ? `${ok("<- [return]:")} ${params.output}` : `${ok("<- [stop]")}`;

  return [
    padded(params.callType ? opcode(params.callType) : "" + functionSignature, padLength),
    padded(functionResult, padLength + 1),
  ].join("\n");
}

interface FormatDecodedFunctionCallParams {
  contract: Contract;
  functionName: string;
  args: unknown[];
  result?: unknown[];
  callType?: CallEvmOpcodes;
  padLength?: number;
}

function formatDecodedFunctionCall(params: FormatDecodedFunctionCallParams) {
  const { args, contract, functionName, padLength = 0 } = params;
  const functionAbi = getFunctionAbi(contract, functionName, args);
  const contractAddressAndLabel = label(contract.label) + label("[") + address(contract.address) + label("]");

  const formattedArgs = formatArgs(functionAbi.inputs, args, padLength + 1);
  const functionSignature = [
    chalk.blue.italic(functionAbi.name + `(${functionAbi.inputs.map((input) => input.type).join(",")})`),
  ];
  const formattedResultValue =
    functionAbi.outputs.length === 0
      ? ""
      : functionAbi.outputs.length === 1
        ? formatArgs(functionAbi.outputs, [params.result], padLength + 2)
        : formatArgs(functionAbi.outputs, params.result as unknown[], padLength + 2);

  const functionResult =
    params.result && functionAbi.outputs.length > 0
      ? [
          ok("[return]: "),
          functionAbi.outputs.length > 1 ? "\n" : "",
          functionAbi.outputs.length > 1 ? formattedResultValue : formattedResultValue.trimStart(),
        ].join("")
      : "";

  const functionLine = padded(
    (params.callType ? opcode(params.callType) + " " : "") + `${contractAddressAndLabel}.${functionSignature}`,
    padLength,
  );
  return [
    functionLine,
    formattedArgs ? "\n" + formattedArgs : "",
    functionResult.length > 0 ? "\n" + padded(functionResult, padLength + 1) : "",
  ].join("");
}

interface FormatRawLogItemParams {
  type: LogEvmOpcodes;
  data: HexStrPrefixed;
  topics: HexStrPrefixed[];
  padLength?: number;
}

export function formatRawLogItem(params: FormatRawLogItemParams) {
  const { type, topics, data, padLength = 0 } = params;
  const logInfo = padded(opcode(type) + " " + label(topics[0] ?? "Anonymous"), padLength);
  let formattedTopics: string[] = [];
  for (let i = 1; i < topics.length; ++i) {
    formattedTopics.push(padded(chalk.gray(`topic ${i}: `) + topics[i], padLength + 1));
  }
  const formattedData = padded(chalk.gray("data: ") + bytes.normalize(data), padLength + 1);
  return [logInfo, ...formattedTopics, formattedData].join("\n");
}

interface FormatDecodedLogItemParams {
  abi: AbiEvent;
  type: LogEvmOpcodes;
  args: Record<string, unknown>;
  padLength?: number;
}

export function formatDecodedLogItem(params: FormatDecodedLogItemParams) {
  const { abi, type, args, padLength = 0 } = params;

  const argNames = Object.keys(args).map((arg) => ({ name: arg }));
  const argValues = Object.values(args);

  const eventSignature =
    chalk.yellow.bold.italic(abi.name) +
    chalk.yellow.italic("(") +
    chalk.yellow.italic(abi.inputs.map((input) => input.type).join(",")) +
    chalk.yellow.italic(")");
  const formattedArgs = formatArgs(argNames, argValues, padLength + 1);
  return [
    padded(opcode(type) + " ", padLength),
    eventSignature,
    formattedArgs.length > 0 ? "\n" + formattedArgs : "",
  ].join("");
}

function formatArgs(
  inputs: { name: string }[] | readonly AbiParameter[],
  args: unknown[],
  padLength: number = 0,
): string {
  if (inputs.length !== args.length) {
    throw new Error("Args and inputs length mismatch");
  }

  if (inputs.length === 0) {
    return "";
  }

  return inputs
    .map((input, ind) => {
      const arg = args[ind];
      const argStringified: string =
        !!arg && typeof arg === "object" ? prettyStringify(arg, padLength) : formatValue(arg);

      return `${chalk.gray(input.name || "_")}: ${argStringified}`;
    })
    .map((line) => padded(line, padLength))
    .join(`\n`);
}

function prettyStringify(value: Object, padLength: number = 2) {
  const valueStringified = JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), padLeft(1));
  return valueStringified
    .split("\n")
    .map((line) => padded(line, padLength))
    .join("\n")
    .trim();
}

function formatValue(arg: unknown) {
  if (arg === undefined) {
    return "";
  }
  if (typeof arg === "string") {
    if (bytes.isValid(arg)) return bytes.normalize(arg);
    return `"${arg}"`;
  }
  return String(arg);
}

export default {
  ok,
  padLeft,
  label,
  opcode,
  address,
  method,
  argument,
  contract,
  padded,
  rawLog: formatRawLogItem,
  decodedLog: formatDecodedLogItem,
  rawFuncCall: formatRawFunctionCall,
  decodedFuncCall: formatDecodedFunctionCall,
};
