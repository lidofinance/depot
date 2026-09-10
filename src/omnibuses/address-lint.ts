import ts from "typescript";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { parse, ParserError, visit } from "@solidity-parser/parser";
import type {
  Expression,
  SourceUnit,
  StateVariableDeclaration,
  TypeName,
  VariableDeclaration,
  VariableDeclarationStatement,
} from "@solidity-parser/parser/dist/src/ast-types";

export interface AddressLintDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

const ADDRESS_LITERAL = /^0x[\da-f]{40}$/i;
const LITERAL_MESSAGE = "Declare this address as a local named constant with an explicit value";

export function lintVoteSources(
  sources: ReadonlyMap<string, string>,
  files: readonly string[],
): AddressLintDiagnostic[] {
  return lintFiles((file) => sources.get(file), files);
}

function lintFiles(read: (file: string) => string | undefined, files: readonly string[]): AddressLintDiagnostic[] {
  const graph = new AddressImports(read);
  return files.flatMap((file) => {
    const source = read(file);
    if (source === undefined) {
      throw new Error(`Missing vote source: ${file}`);
    }
    const diagnostics = file.endsWith(".sol") ? lintSolidity(file, source) : lintTypescript(file, source);
    if (diagnostics.some(({ message }) => message.startsWith("Cannot parse"))) {
      return diagnostics;
    }
    return [...diagnostics, ...graph.check(file)];
  });
}

export interface VoteAddressLintOptions {
  rootDir?: string;
  directories?: string[];
  staged?: boolean;
}

function isVoteSource(file: string): boolean {
  return /\.(ts|sol)$/.test(file) && !/\.(abi\.ts|t\.sol|test\.ts)$/.test(file) && !file.split("/").includes("mount");
}

function readOptionalFile(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && ["ENOENT", "EISDIR", "ENOTDIR"].includes(String(error.code))) {
      return undefined;
    }
    throw error;
  }
}

function sourceFiles(rootDir: string, directory: string): string[] {
  return readdirSync(path.join(rootDir, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "mount" ? [] : sourceFiles(rootDir, file);
    }
    return entry.isFile() && isVoteSource(file) ? [file] : [];
  });
}

export function lintVoteAddresses(options: VoteAddressLintOptions = {}): AddressLintDiagnostic[] {
  const rootDir = options.rootDir ?? process.cwd();
  const indexedFiles = options.staged
    ? new Set(
        execFileSync("git", ["ls-files", "--cached", "-z"], { cwd: rootDir, encoding: "utf8" })
          .split("\0")
          .filter(Boolean),
      )
    : undefined;
  const paths = indexedFiles
    ? [...indexedFiles].filter((file) => file.startsWith("omnibuses/") && isVoteSource(file))
    : sourceFiles(rootDir, "omnibuses");
  const directories = options.directories?.map((directory) =>
    path.relative(rootDir, path.resolve(rootDir, directory)),
  ) ?? [
    ...new Set(
      paths.flatMap((file) => {
        const parts = file.split("/");
        return parts.length === 3 && parts[1] !== "_archive" && (parts[2] === `${parts[1]}.ts` || file.endsWith(".sol"))
          ? [parts.slice(0, 2).join("/")]
          : [];
      }),
    ),
  ];
  const targets = paths.filter((file) => directories.some((directory) => file.startsWith(`${directory}/`))).sort();
  if (options.directories && targets.length === 0) {
    throw new Error(`No vote sources found in ${options.directories.join(", ")}`);
  }
  const contents = new Map<string, string | undefined>();
  const read = (file: string): string | undefined => {
    if (contents.has(file)) {
      return contents.get(file);
    }
    const content =
      indexedFiles && !file.startsWith("node_modules/")
        ? indexedFiles.has(file)
          ? execFileSync("git", ["show", `:${file}`], { cwd: rootDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
          : undefined
        : readOptionalFile(path.resolve(rootDir, file));
    contents.set(file, content);
    return content;
  };
  return lintFiles(read, targets);
}

export function assertVoteAddresses(directory: string): void {
  const diagnostics = lintVoteAddresses({ directories: [directory] });
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(formatAddressDiagnostic).join("\n"));
  }
}

export function formatAddressDiagnostic(diagnostic: AddressLintDiagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`;
}

interface Reference {
  names: string[];
  module?: string;
}

type Binding =
  | { kind: "address" }
  | { kind: "reference"; reference: Reference }
  | { kind: "namespace"; members: Map<string, Binding>; aggregate?: boolean; spreads?: Binding[] }
  | { kind: "other" };

interface ImportUse extends Reference {
  line: number;
  column: number;
}

interface ModuleInfo {
  symbols: Map<string, Binding>;
  wildcards: string[];
  uses: ImportUse[];
}

const OTHER: Binding = { kind: "other" };
const ADDRESS: Binding = { kind: "address" };

function tsReference(node: ts.Expression): string[] | undefined {
  node = unwrapTypescript(node);
  if (ts.isIdentifier(node)) {
    return [node.text];
  }
  if (ts.isPropertyAccessExpression(node)) {
    const parent = tsReference(node.expression);
    if (parent) {
      return [...parent, node.name.text];
    }
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    const parent = tsReference(node.expression);
    if (parent) {
      return [...parent, node.argumentExpression.text];
    }
  }
  return undefined;
}

function scopedTsReference(node: ts.Expression, seen = new Set<ts.Node>()): string[] | undefined {
  if (seen.has(node)) {
    return undefined;
  }
  seen = new Set(seen).add(node);
  const names = tsReference(node);
  if (!names) {
    return undefined;
  }
  for (let scope = node.parent; scope && !ts.isSourceFile(scope); scope = scope.parent) {
    let declarations: readonly ts.VariableDeclaration[] = [];
    if (ts.isBlock(scope) || ts.isCaseBlock(scope)) {
      const statements = ts.isBlock(scope)
        ? scope.statements
        : scope.clauses.flatMap((clause) => [...clause.statements]);
      declarations = statements.flatMap((statement) =>
        ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
      );
    } else if (
      (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)
    ) {
      declarations = scope.initializer.declarations;
    } else if (ts.isCatchClause(scope) && scope.variableDeclaration) {
      declarations = [scope.variableDeclaration];
    }
    for (const declaration of declarations) {
      const binding = destructuredReferences(declaration.name, []).find((item) => item.name.text === names[0]);
      if (binding) {
        const reference = declaration.initializer && scopedTsReference(declaration.initializer, seen);
        return reference ? [...reference, ...binding.names, ...names.slice(1)] : undefined;
      }
    }
    if (
      ts.isFunctionLike(scope) &&
      scope.parameters.some((parameter) =>
        destructuredReferences(parameter.name, []).some((binding) => binding.name.text === names[0]),
      )
    ) {
      return undefined;
    }
  }
  return names;
}

function tsBinding(node: ts.Expression | undefined): Binding {
  if (!node) {
    return OTHER;
  }
  node = unwrapTypescript(node);
  if (ts.isStringLiteralLike(node) && ADDRESS_LITERAL.test(node.text)) {
    return ADDRESS;
  }
  const names = tsReference(node);
  if (names) {
    return { kind: "reference", reference: { names } };
  }
  const members = new Map<string, Binding>();
  if (ts.isObjectLiteralExpression(node)) {
    const spreads: Binding[] = [];
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        spreads.push(tsBinding(property.expression));
      }
      if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
      ) {
        members.set(property.name.text, tsBinding(property.initializer));
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        members.set(property.name.text, tsBinding(property.name));
      }
    }
    return { kind: "namespace", members, aggregate: true, spreads };
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => members.set(String(index), tsBinding(element)));
    return { kind: "namespace", members, aggregate: true };
  }
  return OTHER;
}

function destructuredReferences(
  name: ts.BindingName,
  names: string[],
): Array<{ name: ts.Identifier; names: string[] }> {
  if (ts.isIdentifier(name)) {
    return [{ name, names }];
  }
  return name.elements.flatMap((element, index) => {
    if (ts.isOmittedExpression(element)) {
      return [];
    }
    if (element.dotDotDotToken) {
      return destructuredReferences(element.name, names);
    }
    const property = element.propertyName ?? (ts.isObjectBindingPattern(name) ? element.name : undefined);
    const key =
      property && (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) ? property.text : String(index);
    return destructuredReferences(element.name, [...names, key]);
  });
}

function typescriptModule(file: string, source: string): ModuleInfo {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const info: ModuleInfo = { symbols: new Map(), wildcards: [], uses: [] };
  const addUse = (node: ts.Node, reference: Reference) => {
    const { line, character } = root.getLineAndCharacterOfPosition(node.getStart(root));
    info.uses.push({ ...reference, line: line + 1, column: character + 1 });
  };
  for (const node of root.statements) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          const names = declaration.initializer && tsReference(declaration.initializer);
          if (names) {
            for (const binding of destructuredReferences(declaration.name, names)) {
              info.symbols.set(binding.name.text, { kind: "reference", reference: { names: binding.names } });
            }
          }
          continue;
        }
        const value =
          declaration.initializer ??
          (declaration.type && ts.isLiteralTypeNode(declaration.type) ? declaration.type.literal : undefined);
        info.symbols.set(declaration.name.text, value && ts.isExpression(value) ? tsBinding(value) : OTHER);
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const module = node.moduleSpecifier.text;
      const { name, namedBindings } = node.importClause;
      const addImport = (local: ts.Identifier, names: string[]) => {
        const reference = { module, names };
        info.symbols.set(local.text, { kind: "reference", reference });
        if (names.length > 0) {
          addUse(local, reference);
        }
      };
      if (name) {
        addImport(name, ["default"]);
      }
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        addImport(namedBindings.name, []);
      }
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const binding of namedBindings.elements) {
          if (!binding.isTypeOnly) {
            addImport(binding.name, [(binding.propertyName ?? binding.name).text]);
          }
        }
      }
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const module =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
      if (!node.exportClause && module) {
        info.wildcards.push(module);
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const binding of node.exportClause.elements) {
          if (binding.isTypeOnly) {
            continue;
          }
          const name = (binding.propertyName ?? binding.name).text;
          if (module || name !== binding.name.text) {
            info.symbols.set(binding.name.text, { kind: "reference", reference: { module, names: [name] } });
          }
        }
      }
      if (node.exportClause && ts.isNamespaceExport(node.exportClause) && module) {
        info.symbols.set(node.exportClause.name.text, { kind: "reference", reference: { module, names: [] } });
      }
    }
    if (ts.isExportAssignment(node)) {
      info.symbols.set("default", tsBinding(node.expression));
    }
  }
  function walk(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && !ts.isIdentifier(node.name) && node.initializer) {
      const names = scopedTsReference(node.initializer);
      if (names) {
        for (const binding of destructuredReferences(node.name, names)) {
          addUse(binding.name, { names: binding.names });
        }
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const names = scopedTsReference(node);
      if (names) {
        addUse(node, { names });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(root);
  return info;
}

function solReference(node: Expression): string[] | undefined {
  if (node.type === "Identifier") {
    return [node.name];
  }
  if (node.type === "MemberAccess") {
    const parent = solReference(node.expression);
    if (parent) {
      return [...parent, node.memberName];
    }
  }
  return undefined;
}

function solBinding(node: Expression | null): Binding {
  if (!node) {
    return OTHER;
  }
  if (node.type === "NumberLiteral" && ADDRESS_LITERAL.test(node.number.replaceAll("_", ""))) {
    return ADDRESS;
  }
  if (
    node.type === "FunctionCall" &&
    (node.expression.type === "Identifier" || node.expression.type === "ElementaryTypeName") &&
    /^(address|payable|u?int\d*)$/.test(node.expression.name) &&
    node.arguments.length === 1
  ) {
    return /^(address|payable)$/.test(node.expression.name) && isNumericConversion(node)
      ? ADDRESS
      : solBinding(node.arguments[0]);
  }
  const names = solReference(node);
  return names ? { kind: "reference", reference: { names } } : OTHER;
}

function solidityModule(root: SourceUnit): ModuleInfo {
  const info: ModuleInfo = { symbols: new Map(), wildcards: [], uses: [] };
  const addVariables = (node: StateVariableDeclaration, symbols: Map<string, Binding>) => {
    for (const variable of node.variables) {
      if (variable.name) {
        symbols.set(variable.name, solBinding(variable.expression));
      }
    }
  };
  for (const node of root.children) {
    if (node.type === "ImportDirective") {
      if (node.unitAlias) {
        info.symbols.set(node.unitAlias, { kind: "reference", reference: { module: node.path, names: [] } });
      }
      if (node.symbolAliases) {
        for (const [name, alias] of node.symbolAliases) {
          const reference = { module: node.path, names: [name] };
          info.symbols.set(alias ?? name, { kind: "reference", reference });
          info.uses.push({ ...reference, line: node.loc!.start.line, column: node.loc!.start.column + 1 });
        }
      } else if (!node.unitAlias) {
        info.wildcards.push(node.path);
      }
      info.uses.push({
        module: node.path,
        names: [],
        line: node.loc!.start.line,
        column: node.loc!.start.column + 1,
      });
    }
    if (node.type === "ContractDefinition") {
      const members = new Map<string, Binding>();
      for (const child of node.subNodes) {
        if (child.type === "StateVariableDeclaration") {
          addVariables(child as StateVariableDeclaration, members);
        }
      }
      if (node.kind === "library") {
        for (const binding of members.values()) {
          if (binding.kind === "reference" && members.has(binding.reference.names[0])) {
            binding.reference.names.unshift(node.name);
          }
        }
      }
      info.symbols.set(node.name, { kind: "namespace", members });
      if (node.kind === "contract") {
        for (const [name, binding] of members) {
          info.symbols.set(name, binding);
        }
      }
    }
    if (node.type === "FileLevelConstant") {
      info.symbols.set(node.name, solBinding(node.initialValue));
    }
  }
  const scopes: Array<Set<string>> = [];
  const isShadowed = (name: string) => scopes.some((scope) => scope.has(name));
  visit(root, {
    ContractDefinition(node) {
      if (node.kind === "abstract") {
        const members = new Map<string, Binding>();
        for (const child of node.subNodes) {
          if (child.type === "StateVariableDeclaration") {
            addVariables(child as StateVariableDeclaration, members);
          }
        }
        scopes.push(new Set(members.keys()));
      }
    },
    "ContractDefinition:exit"(node) {
      if (node.kind === "abstract") {
        scopes.pop();
      }
    },
    ModifierDefinition(node) {
      scopes.push(new Set((node.parameters ?? []).flatMap((parameter) => (parameter.name ? [parameter.name] : []))));
    },
    "ModifierDefinition:exit"() {
      scopes.pop();
    },
    ForStatement() {
      scopes.push(new Set());
    },
    "VariableDeclarationStatement:exit"(node, parent) {
      if (parent?.type === "ForStatement" && parent.initExpression === node) {
        for (const variable of node.variables.filter(
          (variable): variable is VariableDeclaration => variable?.type === "VariableDeclaration",
        )) {
          if (variable.name) {
            scopes[scopes.length - 1].add(variable.name);
          }
        }
      }
    },
    "ForStatement:exit"() {
      scopes.pop();
    },
    FunctionDefinition(node) {
      scopes.push(
        new Set(
          [...node.parameters, ...(node.returnParameters ?? [])].flatMap((parameter) =>
            parameter.name ? [parameter.name] : [],
          ),
        ),
      );
    },
    "FunctionDefinition:exit"() {
      scopes.pop();
    },
    Block(node) {
      scopes.push(
        new Set(
          node.statements.flatMap((statement) =>
            statement.type === "VariableDeclarationStatement"
              ? (statement as VariableDeclarationStatement).variables
                  .filter((variable): variable is VariableDeclaration => variable?.type === "VariableDeclaration")
                  .flatMap((variable) => (variable.name ? [variable.name] : []))
              : [],
          ),
        ),
      );
    },
    "Block:exit"() {
      scopes.pop();
    },
    Identifier(node, parent) {
      if (
        info.wildcards.length > 0 &&
        parent?.type !== "ImportDirective" &&
        parent?.type !== "VariableDeclaration" &&
        !isShadowed(node.name)
      ) {
        info.uses.push({ names: [node.name], line: node.loc!.start.line, column: node.loc!.start.column + 1 });
      }
    },
    MemberAccess(node) {
      const names = solReference(node);
      if (names && !isShadowed(names[0])) {
        info.uses.push({ names, line: node.loc!.start.line, column: node.loc!.start.column + 1 });
      }
    },
  });
  return info;
}

class AddressImports {
  private readonly modules = new Map<string, ModuleInfo>();

  constructor(private readonly read: (file: string) => string | undefined) {}

  private module(file: string): ModuleInfo {
    const cached = this.modules.get(file);
    if (cached) {
      return cached;
    }
    const source = this.read(file);
    if (source === undefined) {
      throw new Error(`Cannot read imported source: ${file}`);
    }
    let info: ModuleInfo;
    try {
      info = file.endsWith(".sol")
        ? solidityModule(parse(source, { loc: true, range: true }))
        : typescriptModule(file, source);
    } catch (error) {
      if (!(error instanceof ParserError)) {
        throw error;
      }
      throw new Error(`Cannot parse imported source ${file}: ${error.message}`);
    }
    this.modules.set(file, info);
    return info;
  }

  private resolveModule(file: string, specifier: string): string | undefined {
    if (specifier.endsWith(".sol")) {
      const resolved = specifier.startsWith(".") ? path.posix.join(path.posix.dirname(file), specifier) : specifier;
      return this.read(resolved) !== undefined
        ? resolved
        : this.read(`node_modules/${resolved}`) !== undefined
          ? `node_modules/${resolved}`
          : undefined;
    }
    return ts
      .resolveModuleName(
        specifier,
        `/${file}`,
        { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext },
        {
          fileExists: (name) => this.read(name.slice(1)) !== undefined,
          readFile: (name) => this.read(name.slice(1)),
        },
      )
      .resolvedModule?.resolvedFileName.slice(1);
  }

  private origin(file: string, reference: Reference, seen: Set<string>): string | undefined {
    if (reference.module) {
      const resolved = this.resolveModule(file, reference.module);
      if (!resolved) {
        return undefined;
      }
      file = resolved;
    }
    const key = `${file}:${reference.names.join(".")}`;
    if (seen.has(key)) {
      return undefined;
    }
    seen = new Set(seen).add(key);
    if (file.startsWith("contracts/addresses/")) {
      return file;
    }
    const info = this.module(file);
    const [name, ...rest] = reference.names;
    if (!name) {
      return undefined;
    }
    const binding = info.symbols.get(name);
    if (binding) {
      return this.bindingOrigin(file, binding, rest, seen);
    }
    for (const module of info.wildcards) {
      const origin = this.origin(file, { module, names: reference.names }, seen);
      if (origin) {
        return origin;
      }
    }
    return undefined;
  }

  private bindingOrigin(file: string, binding: Binding, rest: string[], seen: Set<string>): string | undefined {
    if (binding.kind === "address") {
      return rest.length === 0 ? file : undefined;
    }
    if (binding.kind === "reference") {
      return this.origin(file, { ...binding.reference, names: [...binding.reference.names, ...rest] }, seen);
    }
    if (binding.kind === "namespace") {
      const [name, ...tail] = rest;
      const child = binding.members.get(name);
      if (child) {
        return this.bindingOrigin(file, child, tail, seen);
      }
      for (const spread of binding.spreads ?? []) {
        const origin = this.bindingOrigin(file, spread, rest, seen);
        if (origin) {
          return origin;
        }
      }
      if (rest.length === 0 && binding.aggregate) {
        for (const member of binding.members.values()) {
          const origin = this.bindingOrigin(file, member, [], seen);
          if (origin) {
            return origin;
          }
        }
      }
    }
    return undefined;
  }

  check(file: string): AddressLintDiagnostic[] {
    const diagnostics = new Map<string, AddressLintDiagnostic>();
    for (const use of this.module(file).uses) {
      const origin = this.origin(file, use, new Set());
      if (origin && origin !== file) {
        diagnostics.set(`${use.line}:${use.column}:${origin}`, {
          file,
          line: use.line,
          column: use.column,
          message: `Declare the imported address from ${origin} as a local named constant with an explicit value`,
        });
      }
    }
    return [...diagnostics.values()];
  }
}

function isNumericConversion(node: Expression): boolean {
  if (node.type === "NumberLiteral") {
    return true;
  }
  return (
    node.type === "FunctionCall" &&
    (node.expression.type === "Identifier" || node.expression.type === "ElementaryTypeName") &&
    /^(address|payable|u?int\d*)$/.test(node.expression.name) &&
    node.arguments.length === 1 &&
    isNumericConversion(node.arguments[0])
  );
}

function isAddressConstantValue(type: TypeName | null, value: Expression): boolean {
  if (type?.type === "ElementaryTypeName") {
    return type.name === "address" && isNumericConversion(value);
  }
  return (
    type?.type === "UserDefinedTypeName" &&
    value.type === "FunctionCall" &&
    value.arguments.length === 1 &&
    isNumericConversion(value.arguments[0])
  );
}

function lintSolidity(file: string, source: string): AddressLintDiagnostic[] {
  const diagnostics = new Map<number, AddressLintDiagnostic>();
  try {
    const root = parse(source, { loc: true, range: true });
    const allowed: Array<[number, number]> = [];
    const conversions: Array<[number, number]> = [];
    visit(root, {
      VariableDeclaration(node) {
        if (node.isDeclaredConst && node.expression?.range && isAddressConstantValue(node.typeName, node.expression)) {
          allowed.push(node.expression.range);
        }
      },
      FileLevelConstant(node) {
        if (node.initialValue.range && isAddressConstantValue(node.typeName, node.initialValue)) {
          allowed.push(node.initialValue.range);
        }
      },
      FunctionCall(node) {
        if (
          node.expression.type === "Identifier" &&
          (node.expression.name === "address" || node.expression.name === "payable") &&
          isNumericConversion(node) &&
          node.range &&
          !conversions.some(([start, end]) => node.range![0] >= start && node.range![1] <= end)
        ) {
          conversions.push(node.range);
        }
      },
    });
    visit(root, {
      NumberLiteral(node) {
        if (
          ADDRESS_LITERAL.test(node.number.replaceAll("_", "")) &&
          node.range &&
          ![...allowed, ...conversions].some(([start, end]) => node.range![0] >= start && node.range![1] <= end)
        ) {
          diagnostics.set(node.range[0], {
            file,
            line: node.loc!.start.line,
            column: node.loc!.start.column + 1,
            message: LITERAL_MESSAGE,
          });
        }
      },
      FunctionCall(node) {
        if (
          node.range &&
          conversions.some(([start]) => start === node.range![0]) &&
          !allowed.some(([start, end]) => node.range![0] >= start && node.range![1] <= end)
        ) {
          diagnostics.set(node.range[0], {
            file,
            line: node.loc!.start.line,
            column: node.loc!.start.column + 1,
            message: LITERAL_MESSAGE,
          });
        }
      },
    });
  } catch (error) {
    if (!(error instanceof ParserError)) {
      return [
        {
          file,
          line: 1,
          column: 1,
          message: `Cannot parse vote source: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
    return error.errors.map(({ message, line, column }) => ({
      file,
      line,
      column: column + 1,
      message: `Cannot parse vote source: ${message}`,
    }));
  }
  return [...diagnostics.values()];
}

function unwrapTypescript(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function lintTypescript(file: string, source: string): AddressLintDiagnostic[] {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const errors =
    ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    }).diagnostics ?? [];
  if (errors.length > 0) {
    return errors.map((error) => {
      const { line, character } = root.getLineAndCharacterOfPosition(error.start ?? 0);
      return {
        file,
        line: line + 1,
        column: character + 1,
        message: `Cannot parse vote source: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
      };
    });
  }
  const diagnostics: AddressLintDiagnostic[] = [];
  const allowed = new Set<ts.Node>();
  function visit(node: ts.Node): void {
    if (ts.isLiteralTypeNode(node)) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      allowed.add(unwrapTypescript(node.initializer));
    }
    if (ts.isStringLiteralLike(node) && ADDRESS_LITERAL.test(node.text) && !allowed.has(node)) {
      const position = root.getLineAndCharacterOfPosition(node.getStart(root));
      diagnostics.push({ file, line: position.line + 1, column: position.character + 1, message: LITERAL_MESSAGE });
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return diagnostics;
}
