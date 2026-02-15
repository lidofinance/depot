import { AbiParameter, AbiFunction } from "abitype";
import { getAddress } from "viem";
import { Contract, getFunctionAbi } from "../../contracts";
import { Omnibus } from "../omnibus";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { OmnibusExecuteCall } from "../calls/omnibus-execute-call";
import { OmnibusForwardCall } from "../calls/omnibus-forward-call";
import { OmnibusForwardCalls } from "../calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-calls";
import { BuildModelResult, GeneratedAddressRef } from "./model";
import { indentLines, isReferenceType, isTupleParameter, isValidAddress, toCamelCase } from "./utils";
import fs from "node:fs/promises";
import path from "node:path";

type GenerateOmnibusSolidityInput = {
  contractName: string;
  omnibus: Omnibus;
  calls: ReturnType<Omnibus["getCalls"]>;
  model: BuildModelResult;
};

type RenderCtx = {
  byAddress: Map<string, GeneratedAddressRef>;
  byContract: WeakMap<Contract, GeneratedAddressRef>;
  interfacesByAddress: BuildModelResult["interfacesByAddress"];
  submitCallInfos: { constName: string; count: number }[];
  forwardedCallInfos: { constName: string; count: number }[];
};

const TEMPLATE_PATH = path.resolve(__dirname, "templates", "omnibus-contract.sol.tpl");
let templateCache: string | null = null;

export async function renderOmnibusSolidity({ contractName, omnibus, calls, model }: GenerateOmnibusSolidityInput) {
  const { interfacesByAddress } = model;
  const { refs: addresses, byAddress, byContract } = model.addresses;

  const voteItemsCount = calls.length;
  const submitCallInfos: { constName: string; count: number }[] = [];
  const forwardedCallInfos: { constName: string; count: number }[] = [];

  const voteCallsChain = renderVoteCallsBuilderChain(calls, {
    byAddress,
    byContract,
    interfacesByAddress,
    submitCallInfos,
    forwardedCallInfos,
  });

  const constants: string[] = [
    `uint256 public constant VOTE_ITEMS_COUNT = ${voteItemsCount};`,
    ...submitCallInfos.map((item) => `uint256 public constant ${item.constName} = ${item.count};`),
    ...forwardedCallInfos.map((item) => `uint256 public constant ${item.constName} = ${item.count};`),
  ];

  const addressStateVars = addresses.map((addressRef) => {
    if (addressRef.kind === "immutable") {
      return `address public immutable ${addressRef.variableName};`;
    }
    if (!addressRef.address) {
      throw new Error(`Constant "${addressRef.variableName}" is missing address value`);
    }
    return `address public constant ${addressRef.variableName} = ${getAddress(addressRef.address)};`;
  });

  const constructor = renderConstructor(omnibus, addresses);

  const interfaceDeclarations = Array.from(interfacesByAddress.values())
    .map(({ interfaceName, methods }) => {
      const declarations = Array.from(methods.values())
        .map((method) => `    ${formatAbiFunctionForInterface(method.functionAbi)};`)
        .join("\n");
      return `interface ${interfaceName} {\n${declarations}\n}`;
    })
    .join("\n\n");

  const constantsSection = indentLines(constants.join("\n"), 1);
  const addressSection = indentLines(addressStateVars.join("\n"), 1);
  const constructorSection = indentLines(constructor, 1);

  const template = await getTemplate();
  return applyTemplate(template, {
    CONTRACT_NAME: contractName,
    INTERFACE_DECLARATIONS: interfaceDeclarations,
    CONSTANTS_SECTION: constantsSection,
    ADDRESS_SECTION: addressSection,
    CONSTRUCTOR_SECTION: constructorSection,
    VOTE_CALLS_CHAIN: voteCallsChain,
  });
}

async function getTemplate() {
  if (templateCache !== null) {
    return templateCache;
  }
  templateCache = await fs.readFile(TEMPLATE_PATH, "utf-8");
  return templateCache;
}

function applyTemplate(template: string, params: Record<string, string>) {
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function renderVoteCallsBuilderChain(calls: ReturnType<Omnibus["getCalls"]>, ctx: RenderCtx): string {
  const chunks = [`VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT)`];

  for (const [callIndex, call] of calls.entries()) {
    if (call instanceof OmnibusDirectCall) {
      chunks.push(
        `.directCall(${renderString(call.title)}, ${getContractVariable(call.input.on, ctx)}, ${renderDirectCallPayload(call, ctx)})`,
      );
      continue;
    }

    if (call instanceof OmnibusSubmitProposalCall) {
      const submitConstName = `PROPOSAL_${callIndex + 1}_CALLS_COUNT`;
      ctx.submitCallInfos.push({ constName: submitConstName, count: call.calls.length });
      chunks.push(
        `.submitCalls(${renderString(call.title)}, ${getContractVariable(call.governance, ctx)}, ${renderProposalCallsBuilderChain(call, callIndex + 1, submitConstName, ctx)})`,
      );
      continue;
    }

    throw new Error(`Unexpected top-level call type. Expected "directCall" or "submitCalls"`);
  }

  chunks.push(".getCalls()");
  return chunks.join("\n            ");
}

function renderProposalCallsBuilderChain(
  submitCall: OmnibusSubmitProposalCall,
  submitIndex: number,
  submitConstName: string,
  ctx: RenderCtx,
) {
  const chunks = [`ProposalCallsBuilderUtils.create(${submitConstName})`];

  for (const [proposalCallIndex, call] of submitCall.calls.entries()) {
    if (call instanceof OmnibusDirectCall) {
      const value = call.getValue();
      const builderMethod = value > 0n ? "directCallWithValue" : "directCall";
      const valueArg = value > 0n ? `${renderUint(value)}, ` : "";
      chunks.push(
        `.${builderMethod}(${renderString(call.title)}, ${getContractVariable(call.input.on, ctx)}, ${valueArg}${renderDirectCallPayload(call, ctx)})`,
      );
      continue;
    }

    if (call instanceof OmnibusExecuteCall) {
      chunks.push(
        `.executeCall(${renderString(call.title)}, ${getContractVariable(call.executor, ctx)}, ${getContractVariable(call.call.input.on, ctx)}, ${renderUint(call.getValue())}, ${renderDirectCallPayload(call.call, ctx)})`,
      );
      continue;
    }

    if (call instanceof OmnibusForwardCall) {
      chunks.push(
        `.forwardCall(${renderString(call.call.title)}, ${getContractVariable(
          call.forwarder,
          ctx,
        )}, ${getContractVariable(call.call.input.on, ctx)}, ${renderDirectCallPayload(call.call, ctx)})`,
      );
      continue;
    }

    if (call instanceof OmnibusForwardCalls) {
      const forwardedConstName = `FORWARDED_${submitIndex}_${proposalCallIndex + 1}_CALLS_COUNT`;
      ctx.forwardedCallInfos.push({ constName: forwardedConstName, count: call.forwardedCalls.length });
      chunks.push(
        `.forwardCalls(${renderString(call.title)}, ${getContractVariable(
          call.forwarder,
          ctx,
        )}, ${renderForwardedCallsBuilderChain(call, forwardedConstName, ctx)})`,
      );
      continue;
    }

    throw new Error("Unexpected submit proposal call type");
  }

  return chunks.join("\n                ");
}

function renderForwardedCallsBuilderChain(call: OmnibusForwardCalls, callsCountConstName: string, ctx: RenderCtx) {
  const chunks = [`ForwardedCallsBuilderUtils.create(${callsCountConstName})`];
  for (const forwardedCall of call.forwardedCalls) {
    chunks.push(
      `.directCall(${renderString(forwardedCall.title)}, ${getContractVariable(forwardedCall.input.on, ctx)}, ${renderDirectCallPayload(forwardedCall, ctx)})`,
    );
  }
  return chunks.join("\n                    ");
}

function renderDirectCallPayload(call: OmnibusDirectCall, ctx: RenderCtx) {
  const functionAbi = getFunctionAbi(call.input.on, call.input.fn, call.input.args);
  const interfaceInfo = ctx.interfacesByAddress.get(call.input.on.address.toLowerCase());
  if (!interfaceInfo) {
    throw new Error(`Missing interface mapping for address ${call.input.on.address}`);
  }
  return `abi.encodeCall(${interfaceInfo.interfaceName}.${call.input.fn}, (${renderArgs(functionAbi.inputs, call.input.args, ctx)}))`;
}

function renderArgs(inputs: readonly AbiParameter[], args: readonly unknown[] | unknown[], ctx: RenderCtx) {
  if (inputs.length !== args.length) {
    throw new Error(`Unexpected function args length: expected ${inputs.length}, got ${args.length}`);
  }
  return inputs.map((input, index) => renderValueByType(input, args[index], ctx)).join(", ");
}

function renderValueByType(input: AbiParameter, value: unknown, ctx: RenderCtx): string {
  const arrayTypeMatch = input.type.match(/^(.*)\[([0-9]*)\]$/);
  if (arrayTypeMatch) {
    const nestedType = arrayTypeMatch[1];
    if (!nestedType) {
      throw new Error(`Invalid array type "${input.type}"`);
    }
    if (!Array.isArray(value)) {
      throw new Error(`Expected array value for type "${input.type}"`);
    }
    const nestedInput: AbiParameter = {
      ...input,
      type: nestedType,
    };
    return `[${value.map((item) => renderValueByType(nestedInput, item, ctx)).join(", ")}]`;
  }

  if (isTupleParameter(input)) {
    const components = input.components;
    if (Array.isArray(value)) {
      return `(${components.map((component, index) => renderValueByType(component, value[index], ctx)).join(", ")})`;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return `(${components
        .map((component) => {
          if (!component.name) {
            throw new Error(`Unnamed tuple component is not supported for object tuple arguments`);
          }
          return renderValueByType(component, (value as Record<string, unknown>)[component.name], ctx);
        })
        .join(", ")})`;
    }

    throw new Error(`Expected tuple value for input "${input.name}"`);
  }

  if (input.type === "address") {
    if (typeof value !== "string") {
      throw new Error(`Expected string value for address input "${input.name}"`);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      throw new Error(`Invalid address "${value}"`);
    }
    return getAddressVariable(value, ctx.byAddress);
  }

  if (input.type === "string") {
    if (typeof value !== "string") {
      throw new Error(`Expected string value for input "${input.name}"`);
    }
    return renderString(value);
  }

  if (input.type === "bool") {
    if (typeof value !== "boolean") {
      throw new Error(`Expected boolean value for input "${input.name}"`);
    }
    return value ? "true" : "false";
  }

  if (input.type.startsWith("bytes")) {
    if (typeof value !== "string") {
      throw new Error(`Expected hex string value for input "${input.name}"`);
    }
    if (!/^0x([a-fA-F0-9]{2})*$/.test(value)) {
      throw new Error(`Invalid bytes value "${value}"`);
    }
    return `hex"${value.slice(2)}"`;
  }

  if (input.type.startsWith("uint") || input.type.startsWith("int")) {
    return renderNumeric(value, input.name ?? "<unnamed>");
  }

  throw new Error(`Unsupported solidity type "${input.type}"`);
}

function renderNumeric(value: unknown, argName: string) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`Expected integer number for argument "${argName}"`);
    }
    return value.toString(10);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return value;
  }
  throw new Error(`Unsupported numeric argument value for "${argName}"`);
}

function renderString(value: string) {
  return JSON.stringify(value);
}

function renderUint(value: bigint) {
  return value.toString(10);
}

function renderConstructor(omnibus: Omnibus, addresses: GeneratedAddressRef[]) {
  const immutables = addresses.filter((item) => item.kind === "immutable");
  const hasDeploy = omnibus.hasDeployMethod();
  const todoLine = hasDeploy
    ? "        // TODO: verify constructor arguments for contracts from omnibus deploy() section."
    : "";

  if (immutables.length === 0) {
    const body = [todoLine].filter((line) => line.length > 0).join("\n");
    if (body.length > 0) {
      return `constructor() OmnibusBase(VOTING) {\n${body}\n    }`;
    }
    return `constructor() OmnibusBase(VOTING) {}`;
  }

  const constructorArgs = immutables.map((item) => `address ${toCamelCase(item.variableName)}_`).join(", ");
  const assignments = immutables.map((item) => `        ${item.variableName} = ${toCamelCase(item.variableName)}_;`).join("\n");

  const body = [todoLine, assignments].filter((line) => line.length > 0).join("\n");
  return `constructor(${constructorArgs}) OmnibusBase(VOTING) {\n${body}\n    }`;
}

function formatAbiFunctionForInterface(functionAbi: AbiFunction) {
  const mutability =
    functionAbi.stateMutability === "nonpayable" ? "external" : `external ${functionAbi.stateMutability}`;
  const args = functionAbi.inputs.map((input) => formatAbiParameter(input, "input")).join(", ");
  const outputs =
    functionAbi.outputs && functionAbi.outputs.length > 0
      ? ` returns (${functionAbi.outputs.map((output) => formatAbiParameter(output, "output")).join(", ")})`
      : "";
  return `function ${functionAbi.name}(${args}) ${mutability}${outputs}`;
}

function formatAbiParameter(param: AbiParameter, mode: "input" | "output") {
  const needsLocation = isReferenceType(param.type);
  const location = needsLocation ? (mode === "input" ? " calldata" : " memory") : "";
  const name = param.name ? ` ${param.name}` : "";
  return `${param.type}${location}${name}`;
}

function getAddressVariable(address: string, byAddress: Map<string, GeneratedAddressRef>) {
  const addressRef = byAddress.get(address.toLowerCase());
  if (!addressRef) {
    throw new Error(`Address ${address} is missing in constants map`);
  }
  return addressRef.variableName;
}

function getContractVariable(contract: Contract, ctx: Pick<RenderCtx, "byAddress" | "byContract">) {
  const byRef = ctx.byContract.get(contract);
  if (byRef) {
    return byRef.variableName;
  }
  if (isValidAddress(contract.address)) {
    return getAddressVariable(contract.address, ctx.byAddress);
  }
  throw new Error(`Address variable for contract "${contract.label}" is missing`);
}
