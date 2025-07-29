import {
  Account,
  Address,
  Chain,
  ContractFunctionArgs,
  ContractFunctionName,
  CustomTransport,
  HttpTransport,
  PublicClient,
  ReadContractReturnType,
  WalletClient,
} from "viem";
import { Contract } from "../contracts";
import { NetworkName } from "./network";

interface NodeInfo {
  name: string;
  version: string;
}

type PublicWalletClient = PublicClient<HttpTransport | CustomTransport, Chain, undefined> &
  WalletClient<HttpTransport | CustomTransport, Chain, undefined>;

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
    return (this.viemClient.transport as any)["url"] ?? null;
  }

  async simulate<
    const contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "nonpayable" | "payable">,
    const args extends ContractFunctionArgs<contract["abi"], "nonpayable" | "payable", functionName>,
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
    const contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "payable" | "nonpayable">,
    args extends ContractFunctionArgs<contract["abi"], "payable" | "nonpayable", functionName>,
  >(c: contract, functionName: functionName, args: args, options: WriteContractOptions) {
    const { request } = await this.simulate(c, functionName, args, options);

    const txHash = await this.viemClient.writeContract(request);
    const receipt = await this.viemClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  async read<
    const contract extends Contract,
    functionName extends ContractFunctionName<contract["abi"], "pure" | "view">,
    const args extends ContractFunctionArgs<contract["abi"], "pure" | "view", functionName>,
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

  send<M extends string = string, P extends unknown[] = unknown[], R extends unknown = unknown>(
    method: M,
    params: P,
  ): Promise<R> {
    return this.viemClient.transport.request({ method, params });
  }

  getNetworkName() {
    return this.#networkName;
  }

  getBalance(address: Address) {
    return this.viemClient.getBalance({ address });
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
}
