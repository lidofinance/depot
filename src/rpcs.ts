import path from "node:path";
import { JsonRpcProvider } from "ethers";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream } from "node:fs";
import { flatten, kebabCase } from "lodash";
import { Stringable } from "./common/types";
import files from "./common/files";
import treeKill from "tree-kill";

export type Hardfork =
  | "constantinople"
  | "byzantium"
  | "petersburg"
  | "istanbul"
  | "muirGlacier"
  | "berlin"
  | "london"
  | "arrowGlazier"
  | "grayGlacier"
  | "merge"
  | "shanghai";

export type RpcNodeName = "hardhat" | "anvil" | "ganache";

export type HardhatNodeOptions = Partial<{
  port: number;
  fork: string;
  forkBlockNumber: number;
  hostname: string;
}>;

export type AnvilNodeOptions = Partial<{
  accounts: number;
  blockTime: number;
  balance: number;
  configOut: string;
  derivationPath: string;
  dumpState: string;
  hardfork: "shanghai" | "paris" | "london" | "latest";
  init: string;
  ipc: string;
  loadState: string;
  mnemonic: string;
  noMining: boolean;
  order: "fees";
  port: number;
  pruneHistory: number;
  stateInterval: number;
  silent: boolean;
  state: string;
  timestamp: number;
  transactionBlockKeeper: number;
  allowOrigin: string;
  host: string;
  noCors: boolean;
  computeUnitsPerSecond: number;
  forkUrl: string;
  forkBlockNumber: number;
  forkChainId: number | bigint;
  forkRetryBackoff: number; // ??
  noRateLimit: boolean;
  noStorageCaching: boolean;
  retries: number;
  timeout: number;
  blockBaseFeePerGas: number;
  chainId: number;
  codeSizeLimit: number;
  disableBlockGasLimit: boolean;
  gasLimit: number;
  gasPrice: number;
  autoImpersonate: boolean;
  stepsTracing: boolean;
}>;

export type GanacheNodeOptions = Partial<{
  chain: Partial<{
    allowUnlimitedContractSize: boolean;
    allowUnlimitedInitCodeSize: boolean;
    asyncRequestProcessing: boolean;
    chainId: number;
    networkId: number;
    time: string;
    hardfork: Hardfork;
    vmErrorsOnRPCResponse: boolean;
  }>;
  database: Partial<{
    dbPath: string;
  }>;
  logging: Partial<{
    debug: boolean;
    quiet: boolean;
    verbose: boolean;
    file: boolean;
  }>;
  miner: Partial<{
    blockTime: number;
    timestampIncrement: string;
    defaultGasPrice: string;
    blockGasLimit: string;
    difficulty: string;
    callGasLimit: string;
    instamine: "eager" | "strict";
    coinbase: string;
    extraData: string;
    priceBump: string;
  }>;
  wallet: Partial<{
    accounts: string[];
    totalAccounts: number;
    determenistic: boolean;
    seed: string;
    mnemonic: string;
    unlockedAccounts: string[];
    lock: boolean;
    passphrase: string;
    accountKeysPath: string;
    defaultBalance: number;
    hdPath: string;
  }>;
  fork: Partial<{
    url: string;
    network: "mainnet" | "goerli" | "görli" | "sepolia";
    blockNumber: number;
    preLatestConfirmation: number;
    username: string;
    password: string;
    jwt: string;
    userAgent: string;
    origin: string;
    headers: string[];
    requestsPerSecond: number;
    disableCache: boolean;
    deleteCache: boolean;
  }>;
  server: Partial<{
    ws: boolean;
    wsBinary: "true" | "false" | "auto" | boolean;
    rpcEndpoint: string;
    chunkSize: number;
    host: string;
    port: number;
  }>;
}>;

type RpcNodeOptions = AnvilNodeOptions | HardhatNodeOptions | GanacheNodeOptions;
export interface SpawnedRpcNode<N extends RpcNodeName = RpcNodeName, O extends RpcNodeOptions = RpcNodeOptions> {
  url: string;
  host: string;
  port: number;
  name: N;
  options: O;
  process: ChildProcessWithoutNullStreams;
  provider: JsonRpcProvider;
  stop(): Promise<void>;
}

interface SpawnProcessOptions {
  command: string;
  args?: string[];
  flags?: string[];
  listeners?: {
    data?: (listener: (chunk: any) => void) => void;
    error?: (listener: (chunk: any) => void) => void;
  };
}

export const DEFAULT_PORT = 8545;
export const DEFAULT_HOST = "127.0.0.1";

let config = {
  logsDir: path.join(__dirname, "..", "..", "rpc-node-logs"),
};

function setLogsDir(path: string) {
  config.logsDir = path;
}

function getLogsDir() {
  return config.logsDir;
}

function spawnHardhatProcess(options: HardhatNodeOptions): ChildProcessWithoutNullStreams {
  const flags = flatten(
    Object.entries(options)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ["--" + kebabCase(key), value.toString()]),
  );

  return spawnProcess({
    command: "npx",
    args: ["hardhat", "node"],
    flags,
  });
}

function spawnAnvilProcess(options: AnvilNodeOptions) {
  const flags = flatten(
    Object.entries(options)
      .filter(([, value]) => value !== undefined && value !== false)
      .map(([key, value]) => {
        const kebabKey = "--" + kebabCase(key);
        return typeof value === "boolean" ? [kebabKey] : [kebabKey, value.toString()];
      }),
  );

  return spawnProcess({ command: "anvil", flags });
}

function spawnGanacheProcess(options: GanacheNodeOptions) {
  const prefixFlag = (prefix: string, flag: string) => `--${prefix}.${flag}`;
  const flags: string[] = [];
  for (const [namespace, namespaceFlags] of Object.entries(options)) {
    for (const [flag, value] of Object.entries(namespaceFlags) || {}) {
      if (value === undefined) continue;
      flags.push(prefixFlag(namespace, flag), value.toString());
    }
  }

  return spawnProcess({ command: "npx", args: ["ganache-cli"], flags });
}

async function spawnNode(name: "anvil", options?: AnvilNodeOptions): Promise<SpawnedRpcNode<"anvil", AnvilNodeOptions>>;
async function spawnNode(
  name: "hardhat",
  options?: HardhatNodeOptions,
): Promise<SpawnedRpcNode<"hardhat", HardhatNodeOptions>>;
async function spawnNode(
  name: "ganache",
  options?: GanacheNodeOptions,
): Promise<SpawnedRpcNode<"ganache", GanacheNodeOptions>>;
async function spawnNode(name: RpcNodeName, options: RpcNodeOptions = {}): Promise<SpawnedRpcNode> {
  let port: number;
  let host: string;
  let node: ChildProcessWithoutNullStreams;
  if (name === "anvil") {
    port = (options as AnvilNodeOptions).port ?? DEFAULT_PORT;
    host = (options as AnvilNodeOptions).host ?? DEFAULT_HOST;
    node = spawnAnvilProcess({ ...options, port, host } as AnvilNodeOptions);
  } else if (name === "hardhat") {
    port = (options as HardhatNodeOptions).port ?? DEFAULT_PORT;
    host = (options as HardhatNodeOptions).hostname ?? DEFAULT_HOST;
    node = spawnHardhatProcess(options as AnvilNodeOptions);
  } else if (name === "ganache") {
    port = (options as GanacheNodeOptions).server?.port ?? DEFAULT_PORT;
    host = (options as GanacheNodeOptions).server?.host ?? DEFAULT_HOST;
    node = spawnGanacheProcess({
      ...options,
      server: { ...(options as GanacheNodeOptions).server, port, host },
    } as GanacheNodeOptions);
  } else {
    throw new Error(`Unsupported node "${name}"`);
  }

  const nodePid = node.pid;
  if (nodePid === undefined) {
    throw new Error("Failed to spawn process");
  }

  process.on("exit", () => {
    treeKill(nodePid);
  });

  await files.touchDir(config.logsDir);

  return new Promise<SpawnedRpcNode>((resolve, reject) => {
    const url = `http://${host}:${port}`;
    const provider = new JsonRpcProvider(url);

    const absoluteLogPath = path.resolve(config.logsDir, `${name}_${port}.log`);
    const logStream = createWriteStream(absoluteLogPath, { encoding: "utf-8" });
    const errorListener = (chunk: any) => reject(new Error(`RPC Node Error:: ${chunk.toString()}`));

    const stop = () => {
      return new Promise<void>((resolve) => {
        node.on("exit", () => resolve());
        treeKill(nodePid);
      });
    };

    const nodeRunDataListener = (chunk: Stringable) => {
      const hardhatRunMessage = `Started HTTP and WebSocket JSON-RPC server at ${url}`;
      const nodeRunMessage = `Listening on ${host}:${port}`;
      const chunkString = chunk.toString();
      if (chunkString.includes(hardhatRunMessage) || chunkString.includes(nodeRunMessage)) {
        node.stdin.off("data", nodeRunDataListener);
        const url = "http://" + host + ":" + port;
        resolve({ host, port, process: node, url, provider, name, options, stop });
      }
    };

    const nodeLogDataListener = (chunk: Stringable) => {
      logStream.write(chunk.toString());
    };

    node.stderr.on("data", errorListener);
    node.stdout.on("data", nodeRunDataListener);
    node.stdout.on("data", nodeLogDataListener);
    node.stdout.on("close", () => {
      node.stdout.off("data", nodeLogDataListener);
      node.stdout.off("data", nodeRunDataListener);
      logStream.close();
    });
  });
}

function spawnProcess(options: SpawnProcessOptions): ChildProcessWithoutNullStreams {
  const args = options.args || [];
  const spawnedProcess = spawn(options.command, [...args, ...(options.flags || [])]);
  if (options.listeners?.data) {
    spawnedProcess.stdout.on("data", options.listeners.data);
  }
  if (options.listeners?.error) {
    spawnedProcess.stderr.on("data", options.listeners.error);
  }
  process.on("exit", () => {
    spawnedProcess.kill();
  });
  return spawnedProcess;
}

export default { spawn: spawnNode, setLogsDir, getLogsDir, DEFAULT_HOST, DEFAULT_PORT };
