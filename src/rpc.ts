import { networkIdByName, NetworkName } from "./networks";
import providers from "./providers/providers";
import { JsonRpcProvider } from "ethers";

const MARKER_ADDRESS = "0x5A5864ED4E307FB070E415a43781933fa3d05Cf8";
const SNAPSHOT_ID_ADDRESS = "0x953Bb16B965615C506eF8C8c4b9E59E76495Bc1b";

const MODIFY_MARKER_AMOUNT = "0x123456789012345678901234567890"; // big to avoid same amount at real network

export const rollBackNodeChanges = async (provider: JsonRpcProvider) => {
  try {
    const balance = await provider.getBalance(MARKER_ADDRESS);
    if (balance !== BigInt(MODIFY_MARKER_AMOUNT)) {
      return true;
    }
    const snapshotId = await provider.getBalance(SNAPSHOT_ID_ADDRESS);

    await provider.send("evm_revert", [`0x${snapshotId.toString(16)}`]);
    return true;
  } catch (e) {
    return false;
  }
};

export const revertCurrentNode = async (network: NetworkName) => {
  const expectedChainId = networkIdByName[network];
  try {
    const provider = await providers.getProvider(network, "local");
    const { chainId } = await provider.getNetwork();
    if (Number(chainId) !== expectedChainId) {
      return false;
    }
    return rollBackNodeChanges(provider);
  } catch (e) {
    return false;
  }
};

export async function prepareNodeRevertPoint(provider: JsonRpcProvider) {
  const snapshotId = await provider.send("evm_snapshot", []);

  await provider.send("hardhat_setBalance", [MARKER_ADDRESS, MODIFY_MARKER_AMOUNT]);
  await provider.send("hardhat_setBalance", [SNAPSHOT_ID_ADDRESS, snapshotId]);

  return;
}
