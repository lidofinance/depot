import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { JsonRpcProvider, Signer } from "ethers";
import { Address } from "../common/types";

export type RpcProvider = JsonRpcProvider | HardhatEthersProvider;
export type SignerWithAddress = Signer & { address: Address };

export interface SnapshotRestorer {
  revert(): Promise<void>;
  restore(): Promise<void>;
  snapshotId: string;
}
