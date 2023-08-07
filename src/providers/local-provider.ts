import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { JsonRpcProvider, JsonRpcSigner, Signer, Provider } from "ethers";
import { ProviderExtender, SendProvider } from "./types";
import { SignerWithAddress as HreSignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

interface Addressable {
  address: Address;
}
type SignerWithAddress = Signer & Addressable;

export interface LocalNodeInfo {
  name: string;
  version: string;
}

export interface SnapshotRestorer {
  restore(): Promise<void>;
  snapshotId: string;
}

type LocalProviderExtension = {
  accounts(): Promise<Address[]>;
  increaseTime(seconds: number | bigint): Promise<number>;
  mine(): Promise<void>;
  snapshot(): Promise<SnapshotRestorer>;
  revert(snapshotId: string): Promise<void>;
  setCode(address: Address, code: string): Promise<void>;
  setBalance(address: Address, balance: bigint): Promise<void>;
  unlock(address: Address): Promise<SignerWithAddress>;
  getLocalNodeInfo(): Promise<LocalNodeInfo>;
};

export type LocalProvider<T extends SendProvider = SendProvider> = T & LocalProviderExtension;

export interface LocalNodeExtension<T extends SendProvider> {
  setBalance(provider: T, address: Address, balance: bigint): Promise<boolean>;
  setCode(provider: T, address: Address, code: string): Promise<boolean>;
  setNonce(provider: T, address: Address, nonce: number): Promise<void>;
  unlock(provider: T, address: Address): Promise<boolean>;
  lock(provider: T, address: Address): Promise<void>;
}

class InvalidEvmSnapshotResult extends Error {
  constructor() {
    super("The value returned by evm_snapshot should be a string");
  }
}

class InvalidEvmRevertResult extends Error {
  constructor() {
    super("The value returned by evm_revert should be a boolean");
  }
}

export const GanacheLocalNodeExtension: LocalNodeExtension<SendProvider> = {
  setCode(provider, address, code) {
    return provider.send("evm_setAccountCode", [address, code]);
  },
  setBalance(provider, address, balance) {
    return provider.send("evm_setAccountBalance", [address, "0x" + balance.toString(16)]);
  },
  async unlock(provider, address) {
    const passphrase = "";
    await provider.send("evm_addAccount", [address, passphrase]);
    return provider.send("personal_unlockAccount", [address, passphrase]);
  },
  setNonce(provider, address, nonce) {
    return provider.send("evm_setAccountNonce", [address, "0x" + nonce.toString(16)]);
  },
  lock(provider, address) {
    return provider.send("personal_lockAccount", [address]);
  },
};

export const HardhatLocalNodeExtension: LocalNodeExtension<SendProvider> = {
  setCode(provider, address, code) {
    return provider.send("hardhat_setCode", [address, code]);
  },
  setBalance(provider, address, balance) {
    return provider.send("hardhat_setBalance", [address, "0x" + balance.toString(16)]);
  },
  unlock(provider, address) {
    return provider.send("hardhat_impersonateAccount", [address]);
  },
  setNonce(provider, address, nonce) {
    return provider.send("hardhat_setNonce", [address, "0x" + nonce.toString(16)]);
  },
  lock(provider, address) {
    return provider.send("hardhat_stopImpersonatingAccount", [address]);
  },
};

export const AnvilLocalNodeExtension: LocalNodeExtension<SendProvider> = {
  setCode(provider, address, code) {
    return provider.send("anvil_setCode", [address, code]);
  },
  async setBalance(provider, address, balance) {
    await provider.send("anvil_setBalance", [address, "0x" + balance.toString(16)]);
    return true;
  },
  async unlock(provider, address) {
    await provider.send("anvil_impersonateAccount", [address]);
    return true;
  },
  setNonce(provider, address, nonce) {
    return provider.send("anvil_setNonce", [address, "0x" + nonce.toString(16)]);
  },
  lock(provider, address) {
    return provider.send("anvil_stopImpersonatingAccount", [address]);
  },
};

const LOCAL_NODE_EXTENSIONS = {
  anvil: AnvilLocalNodeExtension,
  Ganache: GanacheLocalNodeExtension,
  HardhatNetwork: HardhatLocalNodeExtension,
};

export class LocalProviderExtender<T extends SendProvider>
  implements ProviderExtender<T, LocalProviderExtension>
{
  private readonly localNodeExtensions: Record<string, LocalNodeExtension<SendProvider>>;

  constructor(localNodeExtensions = LOCAL_NODE_EXTENSIONS) {
    this.localNodeExtensions = localNodeExtensions;
  }

  public extend(provider: T): LocalProvider<T> {
    const localNodeExtensions = this.localNodeExtensions;
    let localNodeInfo: LocalNodeInfo | undefined;
    const requestLocalNodeInfo = async () => {
      const clientInfo: string = await provider.send("web3_clientVersion", []);
      const [name, version] = clientInfo.split("/");
      return { name, version };
    };

    const getLocalNodeInfo = async () => {
      if (!localNodeInfo) {
        localNodeInfo = await requestLocalNodeInfo();
      }
      return localNodeInfo;
    };

    const getLocalNodeExtension = async () => {
      const { name } = await getLocalNodeInfo();
      const extension = localNodeExtensions[name];
      if (!extension) {
        throw new Error(`Unsupported local node extension "${name}"`);
      }
      return extension;
    };
    return Object.assign(provider, {
      getLocalNodeInfo,
      async accounts(): Promise<string[]> {
        return provider.send("eth_accounts", []);
      },
      async mine() {
        return provider.send("evm_mine", []);
      },
      async increaseTime(seconds: number | bigint): Promise<number> {
        return provider.send("evm_increaseTime", [encode(seconds)]);
      },
      async snapshot(): Promise<SnapshotRestorer> {
        let snapshotId = await provider.send("evm_snapshot", []);

        if (typeof snapshotId !== "string") {
          throw new InvalidEvmSnapshotResult();
        }

        return {
          restore: async () => {
            await this.revert(snapshotId);
            // re-take the snapshot so that `restore` can be called again
            snapshotId = await provider.send("evm_snapshot", []);
          },
          snapshotId,
        };
      },
      async revert(snapshotId: string) {
        const reverted = await provider.send("evm_revert", [snapshotId]);

        if (typeof reverted !== "boolean") {
          throw new InvalidEvmRevertResult();
        }

        if (!reverted) {
          throw new Error("Revert to snapshot failed");
        }
      },
      async setCode(address: Address, code: string) {
        const extension = await getLocalNodeExtension();
        const success = await extension.setCode(provider, address, code);
        if (!success) {
          throw new Error(`Can't set the code for ${address}`);
        }
      },

      async setBalance(address: Address, balance: bigint) {
        const extension = await getLocalNodeExtension();
        const success = await extension.setBalance(provider, address, balance);
        if (!success) {
          throw new Error(`Can't set balance for account ${address}`);
        }
      },

      async unlock(address: Address) {
        const extension = await getLocalNodeExtension();
        const success = await extension.unlock(provider, address);
        if (!success) {
          throw new Error(`Can't unlock the account ${address}`);
        }

        if (isJsonRpcProvider(provider)) return new JsonRpcSigner(provider, address);
        else if (isHardhatEthersProvider(provider))
          return HreSignerWithAddress.create(provider, address);
        else throw new Error("Unsupported provider type");
      },
    });
  }
}

function encode(value: bigint | number) {
  return "0x" + value.toString(16);
}

function isJsonRpcProvider(provider: unknown): provider is JsonRpcProvider {
  return provider instanceof JsonRpcProvider;
}

function isHardhatEthersProvider(provider: object): provider is HardhatEthersProvider {
  return provider.constructor.name === "HardhatEthersProvider";
}
