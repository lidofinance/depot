import { Address, getAddress } from "viem";
import ts from "typescript";

export function renderDefaultOmnibusDeployment(source: string, address: Address): string {
  const sourceFile = ts.createSourceFile("omnibus.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exportAssignment = sourceFile.statements.find(
    (statement): statement is ts.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );

  if (!exportAssignment || !ts.isCallExpression(exportAssignment.expression)) {
    throw new Error(`Omnibus wrapper must default-export an Omnibus.create({...}) call`);
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
    throw new Error(`Omnibus wrapper must default-export an Omnibus.create({...}) call`);
  }

  const config = args[0];
  const hasDeployment = config.properties.some(
    (property) =>
      "name" in property && property.name !== undefined && getPropertyName(property.name, sourceFile) === "deployment",
  );
  if (hasDeployment) {
    throw new Error(`Omnibus wrapper already contains a "deployment" section`);
  }

  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const insertionPoint = config.getStart(sourceFile) + 1;
  const deployment = [
    "",
    `  deployment: {`,
    `    omnibus: Omnibus.deployedContract("${getAddress(address)}"),`,
    `  },`,
    "",
  ].join(lineBreak);

  return source.slice(0, insertionPoint) + deployment + source.slice(insertionPoint);
}

function getPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}
