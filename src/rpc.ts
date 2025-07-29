import { createDevRpcClient, DevRpcClient, NetworkName } from "./network";

const MARKER_ADDRESS = "0x5A5864ED4E307FB070E415a43781933fa3d05Cf8";
const SNAPSHOT_ID_ADDRESS = "0x953Bb16B965615C506eF8C8c4b9E59E76495Bc1b";

const MODIFY_MARKER_AMOUNT = "0x123456789012345678901234567890"; // big to avoid same amount at real network

export const rollBackNodeChanges = async (client: DevRpcClient) => {
  try {
    const balance = await client.getBalance(MARKER_ADDRESS);
    if (balance !== BigInt(MODIFY_MARKER_AMOUNT)) {
      return true;
    }
    const snapshotId = await client.getBalance(SNAPSHOT_ID_ADDRESS);
    client.revert(`0x${snapshotId.toString(16)}`);
    return true;
  } catch (e) {
    return false;
  }
};

export const revertCurrentNode = async (network: NetworkName, localRpcUrl = "http://localhost:8545") => {
  try {
    const client = await createDevRpcClient(network, localRpcUrl);
    return rollBackNodeChanges(client);
  } catch (e) {
    return false;
  }
};

export async function prepareNodeRevertPoint(client: DevRpcClient) {
  const snapshotId = await client.snapshot();

  await client.setBalance(MARKER_ADDRESS, BigInt(MODIFY_MARKER_AMOUNT));
  await client.setBalance(SNAPSHOT_ID_ADDRESS, BigInt(snapshotId));

  return;
}
