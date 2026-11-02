import chalk from "chalk";
import { KeyStore } from "web3-types";
import { encrypt, decrypt, create } from "web3-eth-accounts";

import bytes from "../common/bytes";
import { KnownError } from "../common/errors";
import { Address, PrivateKey } from "../common/types";

function assertPassword(password: string) {
  if (password.length === 0) {
    throw new KnownError("Password is empty");
  }
}

export class NamedKeystore {
  public readonly version = 3;

  public readonly id: string;
  public readonly name: string;
  public readonly address: Address;
  public readonly crypto: KeyStore["crypto"];

  static async fromPrivateKey(name: string, privateKey: PrivateKey, password: string) {
    if (!bytes.isValid(privateKey)) {
      throw new Error(`Private key is not a valid hex string`);
    }
    privateKey = bytes.normalize(privateKey);
    if (bytes.length(privateKey) !== 32) {
      throw new Error(`Invalid private key length`);
    }
    assertPassword(password);
    return new NamedKeystore(name, await encrypt(privateKey, password));
  }

  static async generate(name: string, password: string): Promise<NamedKeystore> {
    assertPassword(password);
    return new NamedKeystore(name, await encrypt(create().privateKey, password));
  }

  constructor(name: string, keystore: KeyStore) {
    if (name.length === 0) {
      throw new Error("Name is empty");
    }
    this.name = name;
    this.id = keystore.id;
    this.address = bytes.normalize(keystore.address);
    this.crypto = JSON.parse(JSON.stringify(keystore.crypto));
  }

  async decrypt(password: string): Promise<`0x${string}`> {
    try {
      const { privateKey } = await decrypt(this, password);
      return bytes.normalize(privateKey);
    } catch (error: unknown) {
      // web3-eth-accounts reports a wrong password as a MAC mismatch KeyDerivationError
      if (error instanceof Error && error.name === "KeyDerivationError") {
        throw new KnownError(`Wrong password for the account "${this.name}"`, error);
      }
      throw error;
    }
  }

  public toJson() {
    const keystore = JSON.parse(JSON.stringify(this));
    delete keystore.name;
    return JSON.stringify(keystore, null, "  ");
  }

  format() {
    const prettyName = chalk.magenta.bold(this.name);
    const prettyAddress = chalk.white.bold(this.address);
    return `${prettyAddress}: ${prettyName}`;
  }
}
