import path from "path";

export const ADDRESS_LENGTH = 20;

export const ROOT_PATH = path.join(__dirname, "..");
export const CONTRACTS_ABI_CACHE_PATH = path.join(ROOT_PATH, "abi-cache");
export const SUPPORTED_NETWORKS = ["mainnet", "goerli", "sepolia"] as const;
