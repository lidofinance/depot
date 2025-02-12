import { JsonRpcProvider, Network } from "ethers";
import networks, { NetworkName } from "../../src/networks";
import { RpcNodeName } from "../../src/rpcs";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function prepareProviderAndNode(
  networkName: NetworkName,
  hre: HardhatRuntimeEnvironment,
  rpc?: RpcNodeName | "local" | "remote",
  blockNumber?: number,
) {
  const { provider } = await prepareProvider(networkName, hre, rpc, blockNumber);
  await printNetworkInfo(await provider.getNetwork(), rpc);
  return { provider };
}

async function prepareProvider(
  network: NetworkName,
  hre: HardhatRuntimeEnvironment,
  rpc?: RpcNodeName | "local" | "remote",
  blockNumber?: number,
) {
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
    console.log(`Hardhat "${rpc}" RPC node for "${network}" network, on block number ${blockNumber ?? '"latest"'}...`);
    return { provider: hre.ethers.provider } as const;
  }
}

async function printNetworkInfo(network: Network, rpc?: RpcNodeName | "local" | "remote") {
  console.log(`Network:`);
  console.log(`  - rpc: ${rpc}`);
  console.log(`  - name: ${network.name}`);
  console.log(`  - chainId: ${network.chainId}\n`);
}
