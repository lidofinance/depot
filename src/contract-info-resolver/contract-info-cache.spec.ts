import { ContractInfoInMemoryCache, ContractInfoPersistentJsonCache } from "./contract-info-cache";
import { sep } from "path";
import fs from "fs/promises";
import { assert } from "../common/assert";

const CHAIN_ID = 1;
const FLATTENED_CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

const cacheDir = [process.cwd(), 'cache', 'test', 'contract-resolver-cache'].join(sep)
const cachePersistent = ContractInfoPersistentJsonCache.create(cacheDir);
const cacheInMemory = new ContractInfoInMemoryCache();

console.log('CacheDir:', cacheDir)

describe("Contract Persistent Cache", () => {
  beforeEach(async () => {
    try {
      // scared thing
      await fs.rm(cacheDir, { recursive: true }); // remove files
      await fs.mkdir(cacheDir, { recursive: true });
      cachePersistent.clearAll()
    } catch (e) {
      console.error(`Can't remove contract-resolver-cache dir`, e);
    }
  });

  const mockResponse = {
    name: "Flattened",
    abi: [
      { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view" as const, type: "function" as const, },
    ],
    compilerVersion: "v0.6.12+commit.27d51765",
    constructorArgs: "000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84" as const,
    evmVersion: "Default",
    implementation: null,
    sourceCode: "contract A {}",
  };

  it("Request get before set", async () => {
    const contractInfo = await cachePersistent.get(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS);
    assert.equal(contractInfo, null);
  });

  it("Request get after set", async () => {
    await cachePersistent.set(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS, mockResponse);
    const contractInfo = await cachePersistent.get(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(contractInfo, mockResponse);
  });

  it("Request get with error cache", async () => {
    await fs.writeFile(`${cacheDir}${sep}${CHAIN_ID}.json`, JSON.stringify(''));

    await assert.isRejected(cachePersistent.set(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS, mockResponse), /Network data wasn't loaded before write/, 'jkjk')
  });
});

describe("Contract In Memory Cache", () => {
  beforeEach(async () => {
      await cacheInMemory.clearAll()
  });

  const mockResponse = {
    name: "Flattened",
    abi: [
      { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view" as const, type: "function" as const, },
    ],
    compilerVersion: "v0.6.12+commit.27d51765",
    constructorArgs: "000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84" as const,
    evmVersion: "Default",
    implementation: null,
    sourceCode: "contract A {}",
  };

  it("Request get before set", async () => {
    const contractInfo = await cacheInMemory.get(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS);
    assert.equal(contractInfo, null);
  });

  it("Request get after set", async () => {
    await cacheInMemory.set(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS, mockResponse);
    const contractInfo = await cacheInMemory.get(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(contractInfo, mockResponse);
  });
});
