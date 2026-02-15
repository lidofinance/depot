import { AbiFunction, AbiParameter } from "abitype";
import { Contract, getFunctionAbi } from "../../contracts";
import { Omnibus } from "../omnibus";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { OmnibusExecuteCall } from "../calls/omnibus-execute-call";
import { OmnibusForwardCall } from "../calls/omnibus-forward-call";
import { OmnibusForwardCalls } from "../calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-calls";
import { getGovernanceContracts } from "../governance-contracts";
import {
  buildInputHint,
  getUniqueInterfaceName,
  isPlainObject,
  isTupleParameter,
  isValidAddress,
  toSolidityConstName,
  uniqueSolidityIdentifier,
} from "./utils";

export type GeneratedAddressRef = {
  address?: string;
  variableName: string;
  kind: "constant" | "immutable";
};

export type InterfaceMethod = {
  functionAbi: AbiFunction;
  functionName: string;
};

export type CollectInterfacesResult = Map<
  string,
  {
    interfaceName: string;
    methods: Map<string, InterfaceMethod>;
  }
>;

export type AddressRefMaps = {
  refs: GeneratedAddressRef[];
  byAddress: Map<string, GeneratedAddressRef>;
  byContract: WeakMap<Contract, GeneratedAddressRef>;
};

export type BuildModelInput = {
  omnibus: Omnibus;
  calls: ReturnType<Omnibus["getCalls"]>;
  preferredNamesByAddress: Map<string, string>;
};

export type BuildModelResult = {
  interfacesByAddress: CollectInterfacesResult;
  addresses: AddressRefMaps;
};

export function buildGeneratorModel({ omnibus, calls, preferredNamesByAddress }: BuildModelInput): BuildModelResult {
  const interfacesByAddress = collectInterfaces(calls);
  const addresses = collectAddressRefs(omnibus, calls, preferredNamesByAddress);

  for (const { methods } of interfacesByAddress.values()) {
    const overloadedMethodNames = new Set<string>();
    const seenMethodNames = new Set<string>();

    for (const method of methods.values()) {
      if (seenMethodNames.has(method.functionName)) {
        overloadedMethodNames.add(method.functionName);
      } else {
        seenMethodNames.add(method.functionName);
      }
    }

    if (overloadedMethodNames.size > 0) {
      throw new Error(
        `Overloaded contract methods are not supported yet: ${Array.from(overloadedMethodNames)
          .map((name) => `"${name}"`)
          .join(", ")}`,
      );
    }
  }

  return { interfacesByAddress, addresses };
}

function collectInterfaces(calls: ReturnType<Omnibus["getCalls"]>): CollectInterfacesResult {
  const byAddress: CollectInterfacesResult = new Map();
  const usedInterfaceNames = new Set<string>();

  function ensureEntry(contract: Contract) {
    const key = contract.address.toLowerCase();
    let entry = byAddress.get(key);
    if (!entry) {
      const interfaceName = getUniqueInterfaceName(contract.label, usedInterfaceNames);
      entry = { interfaceName, methods: new Map() };
      byAddress.set(key, entry);
    }
    return entry;
  }

  function collectFromDirectCall(call: OmnibusDirectCall) {
    const methodAbi = getFunctionAbi(call.input.on, call.input.fn, call.input.args);
    const signature = formatAbiFunctionForInterface(methodAbi);
    const entry = ensureEntry(call.input.on);
    entry.methods.set(signature, { functionAbi: methodAbi, functionName: call.input.fn });
  }

  function visit(call: ReturnType<Omnibus["getCalls"]>[number]) {
    if (call instanceof OmnibusDirectCall) {
      collectFromDirectCall(call);
      return;
    }
    if (call instanceof OmnibusForwardCall) {
      collectFromDirectCall(call.call);
      return;
    }
    if (call instanceof OmnibusExecuteCall) {
      collectFromDirectCall(call.call);
      return;
    }
    if (call instanceof OmnibusForwardCalls) {
      for (const forwardedCall of call.forwardedCalls) {
        collectFromDirectCall(forwardedCall);
      }
      return;
    }
    if (call instanceof OmnibusSubmitProposalCall) {
      for (const nestedCall of call.calls) {
        visit(nestedCall);
      }
      return;
    }
    throw new Error("Unexpected omnibus call type");
  }

  for (const call of calls) {
    visit(call);
  }

  return byAddress;
}

function collectAddressRefs(
  omnibus: Omnibus,
  calls: ReturnType<Omnibus["getCalls"]>,
  preferredNamesByAddress: Map<string, string>,
): AddressRefMaps {
  const usedNames = new Set<string>();
  const refs: GeneratedAddressRef[] = [];
  const byAddress = new Map<string, GeneratedAddressRef>();
  const byContract = new WeakMap<Contract, GeneratedAddressRef>();
  const deployment = omnibus.getDeployment();
  const deploymentByAddress = new Map(
    Object.entries(deployment ?? {})
      .filter(([, contract]) => isValidAddress(contract.address))
      .map(([deploymentName, contract]) => [contract.address.toLowerCase(), deploymentName]),
  );

  function pushRef(ref: GeneratedAddressRef) {
    refs.push(ref);
    if (ref.address && isValidAddress(ref.address)) {
      byAddress.set(ref.address.toLowerCase(), ref);
    }
    return ref;
  }

  const votingAddress = getGovernanceContracts(omnibus.network).voting.address;
  const votingVarName = "VOTING";
  usedNames.add(votingVarName);
  pushRef({
    address: votingAddress,
    variableName: votingVarName,
    kind: "constant",
  });

  function addAddress(address: string, label: string) {
    const key = address.toLowerCase();
    const existing = byAddress.get(key);
    if (existing) {
      return existing;
    }

    const deploymentName = deploymentByAddress.get(key);
    return pushRef({
      address,
      variableName: uniqueSolidityIdentifier(
        toSolidityConstName(preferredNamesByAddress.get(key) ?? deploymentName ?? label),
        usedNames,
      ),
      kind: deploymentName ? "immutable" : "constant",
    });
  }

  function addContractAddress(contract: Contract, label: string, preferredKind?: "constant" | "immutable") {
    const existingByRef = byContract.get(contract);
    if (existingByRef) {
      return existingByRef;
    }

    if (isValidAddress(contract.address)) {
      const byAddressRef = addAddress(contract.address, label);
      byContract.set(contract, byAddressRef);
      return byAddressRef;
    }

    const ref = pushRef({
      variableName: uniqueSolidityIdentifier(toSolidityConstName(label), usedNames),
      kind: preferredKind ?? "immutable",
    });
    byContract.set(contract, ref);
    return ref;
  }

  for (const [deploymentName, contract] of Object.entries(deployment ?? {})) {
    if (deploymentName === "omnibus") {
      continue;
    }
    const deploymentRef = addContractAddress(contract, deploymentName, "immutable");
    if (deploymentRef.kind !== "immutable") {
      deploymentRef.kind = "immutable";
    }
  }

  function addAddressFromArg(address: string, hint: string) {
    const key = address.toLowerCase();
    if (byAddress.has(key)) {
      return;
    }
    addAddress(address, hint);
  }

  function collectAddressesFromArgs(inputs: readonly AbiParameter[], args: readonly unknown[] | unknown[], hint: string) {
    if (inputs.length !== args.length) {
      throw new Error(`Unexpected function args length while collecting addresses: ${inputs.length} != ${args.length}`);
    }
    for (let i = 0; i < inputs.length; ++i) {
      const input = inputs[i];
      const inputHint = buildInputHint(input, i + 1);
      collectAddressFromValue(input, args[i], `${hint}_${inputHint}`);
    }
  }

  function collectAddressFromValue(input: AbiParameter, value: unknown, hint: string) {
    const arrayTypeMatch = input.type.match(/^(.*)\[([0-9]*)\]$/);
    if (arrayTypeMatch) {
      const nestedType = arrayTypeMatch[1];
      if (!nestedType) {
        throw new Error(`Invalid array type "${input.type}"`);
      }
      if (!Array.isArray(value)) {
        throw new Error(`Expected array value for type "${input.type}"`);
      }

      const nestedInput: AbiParameter = { ...input, type: nestedType };
      for (const item of value) {
        collectAddressFromValue(nestedInput, item, `${hint}_ITEM`);
      }
      return;
    }

    if (isTupleParameter(input)) {
      const components = input.components;
      if (Array.isArray(value)) {
        for (let i = 0; i < components.length; ++i) {
          const component = components[i];
          const componentHint = buildInputHint(component, i + 1);
          collectAddressFromValue(component, value[i], `${hint}_${componentHint}`);
        }
        return;
      }

      if (isPlainObject(value)) {
        for (const component of components) {
          if (!component.name) {
            continue;
          }
          const componentHint = buildInputHint(component, 0);
          collectAddressFromValue(component, value[component.name], `${hint}_${componentHint}`);
        }
      }
      return;
    }

    if (input.type === "address" && typeof value === "string" && isValidAddress(value)) {
      addAddressFromArg(value, hint);
    }
  }

  function collectAddressesFromDirectCall(call: OmnibusDirectCall, hint: string) {
    const functionAbi = getFunctionAbi(call.input.on, call.input.fn, call.input.args);
    collectAddressesFromArgs(functionAbi.inputs, call.input.args, hint);
  }

  function visit(call: ReturnType<Omnibus["getCalls"]>[number]) {
    if (call instanceof OmnibusDirectCall) {
      addContractAddress(call.input.on, call.input.on.label);
      collectAddressesFromDirectCall(call, call.input.fn);
      return;
    }
    if (call instanceof OmnibusForwardCall) {
      addContractAddress(call.forwarder, call.forwarder.label);
      addContractAddress(call.call.input.on, call.call.input.on.label);
      collectAddressesFromDirectCall(call.call, call.call.input.fn);
      return;
    }
    if (call instanceof OmnibusExecuteCall) {
      addContractAddress(call.executor, call.executor.label);
      addContractAddress(call.call.input.on, call.call.input.on.label);
      collectAddressesFromDirectCall(call.call, call.call.input.fn);
      return;
    }
    if (call instanceof OmnibusForwardCalls) {
      addContractAddress(call.forwarder, call.forwarder.label);
      for (const forwardedCall of call.forwardedCalls) {
        addContractAddress(forwardedCall.input.on, forwardedCall.input.on.label);
        collectAddressesFromDirectCall(forwardedCall, forwardedCall.input.fn);
      }
      return;
    }
    if (call instanceof OmnibusSubmitProposalCall) {
      addContractAddress(call.governance, call.governance.label);
      for (const nestedCall of call.calls) {
        visit(nestedCall);
      }
      return;
    }
    throw new Error("Unexpected omnibus call type");
  }

  for (const call of calls) {
    visit(call);
  }

  return { refs, byAddress, byContract };
}

export function formatAbiFunctionForInterface(functionAbi: AbiFunction) {
  const mutability =
    functionAbi.stateMutability === "nonpayable" ? "external" : `external ${functionAbi.stateMutability}`;
  const args = functionAbi.inputs.map((input) => `${input.type}${input.name ? ` ${input.name}` : ""}`).join(", ");
  const outputs =
    functionAbi.outputs && functionAbi.outputs.length > 0
      ? ` returns (${functionAbi.outputs.map((output) => `${output.type}${output.name ? ` ${output.name}` : ""}`).join(", ")})`
      : "";
  return `function ${functionAbi.name}(${args}) ${mutability}${outputs}`;
}
