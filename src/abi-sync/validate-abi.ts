import { Abi } from "abitype";

/** Validate the JSON fields consumed by ABI renderers, preserving legacy fields and metadata. */
export function validateAbi(value: unknown): asserts value is Abi {
  if (!Array.isArray(value)) {
    throw new Error('contains neither an ABI array nor an artifact with an "abi" field');
  }
  value.forEach((entry: unknown, index) => {
    const location = `abi[${index}]`;
    const item = requireObject(entry, location);
    for (const field of ["constant", "payable", "anonymous"]) {
      if (item[field] !== undefined && typeof item[field] !== "boolean") {
        throw new Error(`${location}.${field} must be a boolean`);
      }
    }
    switch (item.type) {
      case "function":
        requireName(item.name, `${location}.name`);
        validateParameters(item.inputs, `${location}.inputs`);
        validateParameters(item.outputs, `${location}.outputs`);
        validateMutability(item.stateMutability, ["pure", "view", "nonpayable", "payable"], location);
        break;
      case "constructor":
        validateParameters(item.inputs, `${location}.inputs`);
        validateMutability(item.stateMutability, ["nonpayable", "payable"], location);
        break;
      case "fallback":
        validateMutability(item.stateMutability, ["nonpayable", "payable"], location);
        break;
      case "receive":
        if (item.stateMutability !== "payable") {
          throw new Error(`${location}.stateMutability must be payable for receive`);
        }
        break;
      case "event":
      case "error":
        requireName(item.name, `${location}.name`);
        validateParameters(item.inputs, `${location}.inputs`);
        break;
      default:
        throw new Error(`${location}.type must be function, constructor, fallback, receive, event or error`);
    }
  });
}

function requireObject(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireName(value: unknown, location: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${location} must be a nonempty string`);
  }
}

function validateMutability(value: unknown, allowed: string[], location: string): void {
  // Older compiler ABIs use constant/payable instead of stateMutability.
  if (value !== undefined && (typeof value !== "string" || !allowed.includes(value))) {
    throw new Error(`${location}.stateMutability must be ${allowed.join(", ")}`);
  }
}

function validateParameters(value: unknown, location: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${location} must be an array`);
  }
  value.forEach((entry: unknown, index) => {
    const parameterLocation = `${location}[${index}]`;
    const parameter = requireObject(entry, parameterLocation);
    requireName(parameter.type, `${parameterLocation}.type`);
    for (const field of ["name", "internalType"]) {
      if (parameter[field] !== undefined && typeof parameter[field] !== "string") {
        throw new Error(`${parameterLocation}.${field} must be a string`);
      }
    }
    if (parameter.indexed !== undefined && typeof parameter.indexed !== "boolean") {
      throw new Error(`${parameterLocation}.indexed must be a boolean`);
    }
    if (/^tuple(?:\[\d*\])*$/.test(parameter.type) || parameter.components !== undefined) {
      validateParameters(parameter.components, `${parameterLocation}.components`);
    }
  });
}
