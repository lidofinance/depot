import { AbiParameter } from "abitype";

export function uniqueSolidityIdentifier(identifier: string, usedNames: Set<string>) {
  let candidate = identifier;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${identifier}_${suffix}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

export function toSolidityConstName(raw: string) {
  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  if (normalized.length === 0) {
    return "CONTRACT";
  }

  if (/^[0-9]/.test(normalized)) {
    return `CONTRACT_${normalized}`;
  }
  return normalized;
}

export function buildInputHint(input: AbiParameter, index: number) {
  const rawName = input.name?.trim() ?? "";
  if (rawName.length > 0) {
    return rawName;
  }
  if (index > 0) {
    return `arg${index}`;
  }
  return "arg";
}

export function toCamelCase(raw: string) {
  const lower = raw.toLowerCase();
  return lower.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

export function getUniqueInterfaceName(label: string, usedNames: Set<string>) {
  const baseName = `I${toPascalCase(label)}`;
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}${suffix}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

export function toPascalCase(raw: string) {
  const chunks = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((item) => item.length > 0);

  if (chunks.length === 0) {
    return "Contract";
  }

  return chunks.map((chunk) => `${chunk.charAt(0).toUpperCase()}${chunk.slice(1).toLowerCase()}`).join("");
}

export function omnibusNameToContractName(name: string) {
  const datePrefixedName = name.match(/^(\d{4})_(\d{2})_(\d{2})(?:_(.+))?$/);
  if (!datePrefixedName) {
    return `Omnibus${toPascalCase(name)}`;
  }

  const [, year, month, day, suffix] = datePrefixedName;
  const datePart = `${year}_${month}_${day}`;

  if (!suffix) {
    return `Omnibus_${datePart}`;
  }

  return `Omnibus_${datePart}_${toPascalCase(suffix)}`;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTupleParameter(input: AbiParameter): input is AbiParameter & { type: "tuple"; components: AbiParameter[] } {
  return input.type === "tuple" && "components" in input && Array.isArray(input.components);
}

export function indentLines(value: string, indentLevel: number) {
  const prefix = "    ".repeat(indentLevel);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function isValidAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isReferenceType(type: string) {
  if (type === "string" || type === "bytes" || type === "tuple") {
    return true;
  }
  return /\[[0-9]*\]$/.test(type);
}
