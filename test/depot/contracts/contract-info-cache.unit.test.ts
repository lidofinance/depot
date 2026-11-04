import { ContractInfoInMemoryCache } from "@/src/contract-info-resolver/contract-info-cache";
import { assert } from "@/src/common/assert";

const NETWORK_NAME = "mainnet";
const FLATTENED_CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

const cacheInMemory = new ContractInfoInMemoryCache();

describe("Contract In Memory Cache", () => {
  beforeEach(async () => {
    await cacheInMemory.clearAll();
  });

  const mockResponse = {
    name: "Flattened",
    abi: [
      {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view" as const,
        type: "function" as const,
      },
    ],
    implementation: null,
  };

  it("Request get before set", async () => {
    const contractInfo = await cacheInMemory.get(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS);
    assert.equal(contractInfo, null);
  });

  it("Request get after set", async () => {
    await cacheInMemory.set(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS, mockResponse);
    const contractInfo = await cacheInMemory.get(NETWORK_NAME, FLATTENED_CONTRACT_ADDRESS);

    assert.deepEqual(contractInfo, mockResponse);
  });
});
