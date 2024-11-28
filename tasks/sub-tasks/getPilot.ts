import { Wallet } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import votes from "../../src/votes";
import format from "../../src/common/format";
import bytes from "../../src/common/bytes";

export const getPilot = async (provider: JsonRpcProvider, hre: HardhatRuntimeEnvironment, testAccount?: boolean) => {
  const pilot = testAccount
    ? await votes.creator(provider)
    : await hre.keystores.unlock().then((privateKey) => new Wallet(privateKey));

  console.log(`Deployer ${format.address(bytes.normalize(await pilot.getAddress()))}`);
  console.log(`  - nonce: ${await pilot.getNonce()}`);
  console.log(`  - balance: ${hre.ethers.formatEther(await provider.getBalance(pilot))} ETH\n`);

  return pilot;
};
