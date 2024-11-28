import { cheats } from "./cheats";
import { Block, ContractRunner } from "ethers";
import { RpcProvider } from "./types";
import { isHardhatEthersProvider, isJsonRpcProvider, UnsupportedProviderError } from "./utils";

function provider(runner: ContractRunner): RpcProvider {
  const { provider } = runner;

  if (!provider) {
    throw new Error("Provider is empty");
  }

  if (!isJsonRpcProvider(provider) && !isHardhatEthersProvider(provider)) {
    throw new UnsupportedProviderError(provider);
  }
  return provider as RpcProvider;
}

async function chainId(runner: ContractRunner): Promise<bigint> {
  const { chainId } = await provider(runner).getNetwork();
  return chainId;
}

async function seek(provider: RpcProvider, timestamp: number): Promise<Block> {
  let blockNumber = await provider.getBlockNumber();

  let block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`Block ${blockNumber} not found`);
  }

  if (timestamp > block.timestamp) {
    throw new Error(`The date is in the future`);
  }

  while (true) {
    const delta = block.timestamp - timestamp;
    if (Math.abs(delta) < 3600) break;
    const estimatedBlockNumber: number = block.number - Math.floor(delta / 14);
    block = await provider.getBlock(estimatedBlockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }
  }
  return block;
}

export default { cheats, provider, chainId };
