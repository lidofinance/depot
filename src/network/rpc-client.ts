import {
  Abi,
  AbiEvent,
  Account,
  Address,
  BlockNumber,
  BlockTag,
  Chain,
  ContractFunctionArgs,
  ContractFunctionName,
  CreateEventFilterParameters,
  CustomTransport,
  GetFilterLogsParameters,
  GetTransactionCountParameters,
  GetTransactionParameters,
  GetTransactionReceiptParameters,
  HttpTransport,
  MaybeAbiEventName,
  MaybeExtractEventArgsFromAbi,
  PublicClient,
  ReadContractReturnType,
  WalletClient,
} from "viem";
import { Contract } from "../contracts";
import { NetworkName } from "./network";
import { HexStrPrefixed } from "../common/bytes";

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

    const txHash = await this.viemClient.writeContract(request);
    const receipt = await this.viemClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  async read<
    contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "pure" | "view">,
    args extends ContractFunctionArgs<contract["abi"], "pure" | "view", functionName>,
  >(
    { abi, address }: contract,
    functionName: functionName,
    args: args,
  ): Promise<ReadContractReturnType<contract["abi"], functionName, args>> {
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
    const hash = await this.viemClient.deployContract({
      abi: input.abi,
      args: input.args,
      bytecode: input.bytecode,
      chain: this.viemClient.chain,
      account: options.from,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas,
    });
    const receipt = await this.viemClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error(`Contract deploy failed`);
    }
    return receipt.contractAddress;
  }

  getNetworkName() {
    return this.#networkName;
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

  getFilterLogs<
    abi extends Abi | readonly unknown[] | undefined,
    eventName extends string | undefined,
    strict extends boolean | undefined = undefined,
    fromBlock extends BlockNumber | BlockTag | undefined = undefined,
    toBlock extends BlockNumber | BlockTag | undefined = undefined,
  >(args: GetFilterLogsParameters<abi, eventName, strict, fromBlock, toBlock>) {
    return this.viemClient.getFilterLogs(args);
  }

  createEventFilter<
    abiEvent extends AbiEvent | undefined = undefined,
    abiEvents extends readonly AbiEvent[] | readonly unknown[] | undefined = abiEvent extends AbiEvent
      ? [abiEvent]
      : undefined,
    strict extends boolean | undefined = undefined,
    fromBlock extends BlockNumber | BlockTag | undefined = undefined,
    toBlock extends BlockNumber | BlockTag | undefined = undefined,
    _EventName extends string | undefined = MaybeAbiEventName<abiEvent>,
    _Args extends MaybeExtractEventArgsFromAbi<abiEvents, _EventName> | undefined = undefined,
  >(
    args?: CreateEventFilterParameters<abiEvent, abiEvents, strict, fromBlock, toBlock, _EventName, _Args> | undefined,
  ) {
    return this.viemClient.createEventFilter(args);
  }
}
