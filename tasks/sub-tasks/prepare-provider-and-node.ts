import { JsonRpcProvider } from "ethers";
import networks, { NetworkName } from "../../src/networks";
import rpcs, { RpcNodeName } from "../../src/rpcs";

export async function prepareProviderAndNode(
  networkName: NetworkName,
  rpc?: RpcNodeName | "local" | "remote",
  blockNumber?: number,
) {
  const { provider, spawnedNode } = await prepareProvider(networkName, rpc, blockNumber);
  await printNetworkInfo(provider, rpc);
  return { provider, spawnedNode };
}

async function prepareProvider(network: NetworkName, rpc?: RpcNodeName | "local" | "remote", blockNumber?: number) {
  if (rpc === "remote") {
    console.log(`Running on the remote RPC node on network "${network}"`);
    return { provider: new JsonRpcProvider(networks.rpcUrl("eth", network)) } as const;
  } else if (rpc === "local") {
    const url = networks.localRpcUrl("eth");
    console.log(
      `Running on the local RPC node on url ${url}. Expected network ${network}, expected blockNumber ${
        blockNumber ?? '"any"'
      }`,
    );
    const provider = new JsonRpcProvider(url);
    const currentBlockNumber = await provider.getBlockNumber();
    if (blockNumber !== undefined && currentBlockNumber !== blockNumber) {
      throw new Error(
        `Local RPC node set on the wrong block number. Expected ${blockNumber}, actual: ${currentBlockNumber}`,
      );
    }
    return { provider } as const;
  } else {
    console.log(`Spawning "${rpc}" RPC node for "${network}" network, on block number ${blockNumber ?? '"latest"'}...`);
    const node = await spawnRpcNode(network, rpc, blockNumber);
    console.log(`RPC node was successfully spawned on ${node.url}`);
    return { provider: node.provider, spawnedNode: node } as const;
  }
}

async function spawnRpcNode(network: NetworkName, nodeType?: RpcNodeName, blockNumber?: number) {
  console.log(nodeType);
  try {
    if (nodeType === "hardhat")
      return rpcs.spawn("hardhat", {
        fork: networks.rpcUrl("eth", network),
        forkBlockNumber: blockNumber,
      });
    else if (nodeType === "anvil")
      return rpcs.spawn("anvil", {
        forkUrl: networks.rpcUrl("eth", network),
        forkBlockNumber: blockNumber,
      });
  } catch (err) {
    throw new Error(`Failed to spawn "${nodeType}" node: ${err}`);
  }
  throw new Error(`Unsupported node type "${nodeType}"`);
}

async function printNetworkInfo(provider: JsonRpcProvider, rpc?: RpcNodeName | "local" | "remote") {
  const network = await provider.getNetwork();
  console.log(`Network:`);
  console.log(`  - rpc: ${rpc}`);
  console.log(`  - name: ${network.name}`);
  console.log(`  - chainId: ${network.chainId}\n`);
}
