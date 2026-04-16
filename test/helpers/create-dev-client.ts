import hre from "hardhat";
import { EthereumProvider } from "hardhat/types";

import { createDevRpcClient } from "../../src/network/network";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { NetworkName } from "../../src/network/network";

export async function createInProcessDevRpcClient(network: NetworkName = "mainnet"): Promise<DevRpcClient> {
  const connection = await hre.network.connect({ network: "default" });
  return createDevRpcClient(network, connection.provider as EthereumProvider);
}
