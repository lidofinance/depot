import {
  Abi,
  AbiEvent,
  Account,
  Address,
  BlockTag,
  Chain,
  ContractFunctionArgs,
  ContractFunctionName,
  CustomTransport,
  encodeDeployData,
  encodeFunctionData,
  GetLogsParameters,
  GetTransactionCountParameters,
  GetTransactionParameters,
  GetTransactionReceiptParameters,
  Hash,
  Hex,
  HttpTransport,
  keccak256,
  LocalAccount,
  Log,
  PublicClient,
  ReadContractReturnType,
  TransactionReceipt,
  WalletClient,
} from "viem";
import { Contract } from "../contracts";
import { NetworkName } from "./network";
import { HexStrPrefixed } from "../common/bytes";
import { errorMessage, KnownError } from "../common/errors";

interface NodeInfo {
  name: string;
  version: string;
}

interface DeployContractInput {
  abi: Abi;
  bytecode: HexStrPrefixed;
  args?: unknown[];
}

type PublicWalletClient = PublicClient<HttpTransport | CustomTransport, Chain | undefined, undefined> &
  WalletClient<HttpTransport | CustomTransport, Chain | undefined, undefined>;

export interface WriteContractOptions {
  from: Address | Account;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  disableSimulation?: boolean;
}

interface TransactionData {
  to?: Address;
  data: Hex;
}

// many RPCs cap eth_getLogs at 5000 blocks, both ends inclusive
const GET_LOGS_WINDOW = 4999n;

export interface LogsQuery {
  address: Address;
  event: AbiEvent;
  args?: GetLogsParameters<AbiEvent>["args"];
  fromBlock: bigint;
  toBlock?: bigint;
}

function isLocalAccount(from: Address | Account): from is LocalAccount {
  return typeof from === "object" && from.type === "local";
}

function rerunError(failure: string, hash: Hash, cause: unknown): KnownError {
  return new KnownError(
    `${failure}: ${errorMessage(cause).split("\n")[0]}. Do not rerun: check ${hash} and the sender nonce in a block explorer`,
    cause instanceof Error ? cause : undefined,
  );
}

export class RpcClient {
  #networkName: NetworkName;
  viemClient: PublicWalletClient;

  constructor(networkName: NetworkName, client: PublicWalletClient) {
    this.viemClient = client;
    this.#networkName = networkName;
  }

  getRpcUrl() {
    return ((this.viemClient.transport as Record<string, unknown>)["url"] as string) ?? null;
  }

  async simulate<
    contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "nonpayable" | "payable">,
    args extends ContractFunctionArgs<contract["abi"], "nonpayable" | "payable", functionName>,
  >({ abi, address }: contract, functionName: functionName, args: args, options: WriteContractOptions) {
    return this.viemClient.simulateContract({
      abi,
      address,
      functionName,
      args: args as unknown[],
      account: options.from,
    });
  }

  async write<
    contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "payable" | "nonpayable">,
    args extends ContractFunctionArgs<contract["abi"], "payable" | "nonpayable", functionName>,
  >(c: contract, functionName: functionName, args: args, options: WriteContractOptions) {
    const { request } = await this.simulate(c, functionName, args, options);

    if (isLocalAccount(options.from)) {
      // widened: viem cannot resolve the encoder overload for a generic ABI
      const abi: Abi = c.abi;
      const encodedFunctionName: string = functionName;
      const data = encodeFunctionData({ abi, functionName: encodedFunctionName, args: args as unknown[] });
      return this.#signAndSend(options.from, { to: c.address, data }, options);
    }
    const txHash = await this.viemClient.writeContract(request);
    return this.#waitForSuccessfulReceipt(txHash);
  }

  async read<
    contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "pure" | "view">,
    args extends ContractFunctionArgs<contract["abi"], "pure" | "view", functionName>,
  >(
    { abi, address }: contract,
    functionName: functionName,
    // When the method has no parameters, `args` can be omitted.
    ...rest: args extends readonly [] ? [args?: args] : [args: args]
  ): Promise<ReadContractReturnType<contract["abi"], functionName, args>> {
    const args = (rest[0] ?? []) as args;
    return this.viemClient.readContract({
      abi: abi,
      functionName,
      args: args as unknown[],
      address: address,
    }) as Promise<ReadContractReturnType<contract["abi"], functionName, args>>;
  }

  send<M extends string = string, P extends unknown[] = unknown[], R = unknown>(method: M, params: P): Promise<R> {
    return this.viemClient.transport.request({ method, params });
  }

  async deployContract(input: DeployContractInput, options: WriteContractOptions) {
    let receipt: TransactionReceipt;
    if (isLocalAccount(options.from)) {
      receipt = await this.#signAndSend(options.from, { data: encodeDeployData(input) }, options);
    } else {
      const hash = await this.viemClient.deployContract({
        abi: input.abi,
        args: input.args,
        bytecode: input.bytecode,
        chain: this.viemClient.chain,
        account: options.from,
        maxFeePerGas: options.maxFeePerGas,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas,
      });
      receipt = await this.#waitForSuccessfulReceipt(hash);
    }
    if (!receipt.contractAddress) {
      throw new Error(`Contract deploy failed`);
    }
    return receipt.contractAddress;
  }

  getNetworkName() {
    return this.#networkName;
  }

  // the hash is printed before sending: a dropped response must not hide a transaction already in the mempool
  async #signAndSend(
    account: LocalAccount,
    transaction: TransactionData,
    options: WriteContractOptions,
  ): Promise<TransactionReceipt> {
    const request = await this.viemClient.prepareTransactionRequest({
      ...transaction,
      account,
      chain: this.viemClient.chain,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas,
    });
    const serializedTransaction = await this.viemClient.signTransaction({ ...request, chain: this.viemClient.chain });
    const hash = keccak256(serializedTransaction);
    console.log(`Sending transaction ${hash}`);

    try {
      await this.viemClient.sendRawTransaction({ serializedTransaction });
    } catch (error) {
      throw rerunError(`Sending transaction ${hash} failed`, hash, error);
    }
    return this.#waitForSuccessfulReceipt(hash);
  }

  async #waitForSuccessfulReceipt(hash: Hash): Promise<TransactionReceipt> {
    let receipt: TransactionReceipt;
    try {
      receipt = await this.viemClient.waitForTransactionReceipt({ hash });
    } catch (error) {
      throw rerunError(`Waiting for the receipt of transaction ${hash} failed`, hash, error);
    }
    if (receipt.status !== "success") {
      throw new KnownError(
        `Transaction ${hash} reverted in block ${receipt.blockNumber}. Do not rerun before finding the revert reason`,
      );
    }
    return receipt;
  }

  getBalance(address: Address) {
    return this.viemClient.getBalance({ address });
  }

  getBlockNumber() {
    return this.viemClient.getBlockNumber();
  }

  #node: NodeInfo | null = null;

  async getNodeInfo(): Promise<NodeInfo> {
    if (this.#node) return this.#node;

    const clientInfo: string = await this.viemClient.transport.request({ method: "web3_clientVersion" });
    const [name = "unknown", version = "0.0.0"] = clientInfo.toLowerCase().split("/");

    if (name.startsWith("anvil")) {
      this.#node = { name: "anvil", version };
    } else if (name.startsWith("hardhat")) {
      this.#node = { name: "hardhat", version };
    } else {
      this.#node = { name, version };
    }

    return this.#node;
  }

  async getChainTime() {
    return this.viemClient.getBlock().then((block) => Number(block.timestamp));
  }

  getTransactionReceipt(args: GetTransactionReceiptParameters) {
    return this.viemClient.getTransactionReceipt(args);
  }

  getTransaction<blockTag extends BlockTag = "latest">(args: GetTransactionParameters<blockTag>) {
    return this.viemClient.getTransaction(args);
  }

  getTransactionCount(args: GetTransactionCountParameters) {
    return this.viemClient.getTransactionCount(args);
  }

  /** Searches forward from `fromBlock` to `toBlock` (default latest); `firstMatch` stops at the first window with logs. */
  async getLogsInWindows(query: LogsQuery, firstMatch = false) {
    const lastBlock = query.toBlock ?? (await this.getBlockNumber());
    const logs: Log<bigint, number, false>[] = [];
    for (let windowStart = query.fromBlock; windowStart <= lastBlock; windowStart += GET_LOGS_WINDOW) {
      const windowEnd = windowStart + GET_LOGS_WINDOW - 1n;
      logs.push(
        ...(await this.viemClient.getLogs({
          address: query.address,
          event: query.event,
          args: query.args,
          fromBlock: windowStart,
          toBlock: windowEnd < lastBlock ? windowEnd : lastBlock,
        })),
      );
      if (firstMatch && logs.length > 0) {
        break;
      }
    }
    return logs;
  }
}
