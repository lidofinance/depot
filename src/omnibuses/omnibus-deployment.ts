import { Address, getAddress } from "viem";
import ts from "typescript";
import { KnownError } from "../common/errors";
import { Contract } from "../contracts";

function findCreateConfig(sourceFile: ts.SourceFile) {
  const exportAssignment = sourceFile.statements.find(
    (statement): statement is ts.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );

  if (!exportAssignment || !ts.isCallExpression(exportAssignment.expression)) {
    throw new KnownError(`Omnibus wrapper must default-export an Omnibus.create({...}) call`);
  }

  const { expression, arguments: args } = exportAssignment.expression;
  if (
    !ts.isPropertyAccessExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== "Omnibus" ||
    expression.name.text !== "create" ||
    args.length !== 1 ||
    !ts.isObjectLiteralExpression(args[0])
  ) {
    throw new KnownError(`Omnibus wrapper must default-export an Omnibus.create({...}) call`);
  }

  return { exportAssignment, config: args[0] };
}

function parseWrapper(source: string) {
  return ts.createSourceFile("omnibus.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Sets `voteId` of the wrapper, which must be absent or `undefined` and not followed by a spread. */
export function renderVoteId(source: string, voteId: bigint): string {
  const renderedSource = insertVoteId(source, voteId);
  assertVoteIdRendered(renderedSource, voteId);
  return renderedSource;
}

function insertVoteId(source: string, voteId: bigint): string {
  const sourceFile = parseWrapper(source);
  const { config } = findCreateConfig(sourceFile);
  const { properties } = config;
  const index = properties.findIndex((item) => isPropertyNamed(item, "voteId", sourceFile));
  if (index === -1) {
    // appended last, so no spread can override it
    const lastProperty = properties.at(-1);
    if (!lastProperty) {
      const start = config.getStart(sourceFile) + 1;
      return `${source.slice(0, start)} voteId: ${voteId} ${source.slice(start)}`;
    }
    const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
    const isMultiLine = source.slice(config.getStart(sourceFile), lastProperty.end).includes("\n");
    const separator = isMultiLine ? `${lineBreak}  ` : " ";
    const start = properties.hasTrailingComma ? findCommaEnd(source, lastProperty.end) : lastProperty.end;
    const text = properties.hasTrailingComma ? `${separator}voteId: ${voteId},` : `,${separator}voteId: ${voteId}`;
    return source.slice(0, start) + text + source.slice(start);
  }
  const property = properties[index];
  if (
    !ts.isPropertyAssignment(property) ||
    !ts.isIdentifier(property.initializer) ||
    property.initializer.text !== "undefined"
  ) {
    throw new KnownError(`Omnibus wrapper "voteId" must be undefined before the launch is recorded`);
  }
  if (properties.slice(index + 1).some((item) => ts.isSpreadAssignment(item))) {
    throw new KnownError(`Omnibus wrapper "voteId" must follow every spread of the Omnibus.create({...}) config`);
  }
  const { initializer } = property;
  return source.slice(0, initializer.getStart(sourceFile)) + voteId + source.slice(initializer.end);
}

function findCommaEnd(source: string, position: number): number {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
    undefined,
    position,
  );
  if (scanner.scan() !== ts.SyntaxKind.CommaToken) {
    throw new KnownError(`Omnibus wrapper trailing comma of the Omnibus.create({...}) config is not found`);
  }
  return scanner.getTokenEnd();
}

function assertVoteIdRendered(source: string, voteId: bigint): void {
  const sourceFile = parseWrapper(source);
  const { config } = findCreateConfig(sourceFile);
  const property = config.properties.find((item) => isPropertyNamed(item, "voteId", sourceFile));
  if (
    !property ||
    !ts.isPropertyAssignment(property) ||
    !ts.isNumericLiteral(property.initializer) ||
    BigInt(property.initializer.text) !== voteId
  ) {
    throw new KnownError(`Omnibus wrapper "voteId" could not be recorded as ${voteId}`);
  }
}

export function renderDefaultOmnibusDeployment(source: string, address: Address): string {
  const sourceFile = parseWrapper(source);
  const { exportAssignment, config } = findCreateConfig(sourceFile);

  const hasDeployment = config.properties.some((property) => isPropertyNamed(property, "deployment", sourceFile));
  if (hasDeployment) {
    throw new KnownError(`Omnibus wrapper already contains a "deployment" section`);
  }
  // "deployment" is inserted first, so any spread could override it
  if (config.properties.some((property) => ts.isSpreadAssignment(property))) {
    throw new KnownError(
      `Omnibus wrapper must not spread into the Omnibus.create({...}) config to record "deployment"`,
    );
  }

  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const identifiers = new Set<string>();
  function collectIdentifiers(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      identifiers.add(node.text);
    }
    ts.forEachChild(node, collectIdentifiers);
  }
  collectIdentifiers(sourceFile);
  let addressName = "DEPLOYED_OMNIBUS_ADDRESS";
  for (let suffix = 2; identifiers.has(addressName); suffix++) {
    addressName = `DEPLOYED_OMNIBUS_ADDRESS_${suffix}`;
  }
  const declaration = `const ${addressName} = "${getAddress(address)}";${lineBreak}${lineBreak}`;
  const insertionPoint = config.getStart(sourceFile) + 1;
  const deployment = ["", `  deployment: {`, `    omnibus: Omnibus.deployedContract(${addressName}),`, `  },`, ""].join(
    lineBreak,
  );

  const exportStart = exportAssignment.getStart(sourceFile);
  return (
    source.slice(0, exportStart) +
    declaration +
    source.slice(exportStart, insertionPoint) +
    deployment +
    source.slice(insertionPoint)
  );
}

function isPropertyNamed(property: ts.ObjectLiteralElementLike, name: string, sourceFile: ts.SourceFile): boolean {
  return "name" in property && property.name !== undefined && getPropertyName(property.name, sourceFile) === name;
}

function getPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}

export function renderCustomOmnibusDeployment(contracts: Record<string, Contract>): string {
  const entries = Object.entries(contracts);
  const declarations = entries.map(
    ([, contract], index) => `const DEPLOYED_CONTRACT_${index + 1} = "${getAddress(contract.address)}";`,
  );
  const properties = entries.map(
    ([key, contract], index) =>
      `  ${JSON.stringify(key)}: { address: DEPLOYED_CONTRACT_${index + 1}, label: ${JSON.stringify(contract.label)}, abi: ${JSON.stringify(contract.abi)} },`,
  );
  return [
    ...declarations,
    "",
    "const DEPLOYED_CONTRACTS = {",
    ...properties,
    "} as unknown as Awaited<ReturnType<typeof deploy>>;",
  ].join("\n");
}
