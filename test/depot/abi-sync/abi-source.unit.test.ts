import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import { deps, fetchAbiFromEtherscan } from "@/src/abi-sync/abi-source";
import { ContractInfo } from "@/src/contract-info-resolver/types";

const PROXY = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const IMPLEMENTATION = "0x89eDa99C0551d4320b56F82DDE8dF2f8D2eF81aA";
const UPGRADED_IMPLEMENTATION = "0xDD76927045435C7605cf6f5F978cfb8CABDb5F80";

const PROXY_ABI: Abi = [
  {
    type: "function",
    name: "proxy__upgradeTo",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation_", type: "address" }],
    outputs: [],
  },
];
const STAKING_ROUTER_ABI: Abi = [
  { type: "function", name: "updateStakingModule", stateMutability: "nonpayable", inputs: [], outputs: [] },
];

function contractInfo(name: string, abi: Abi, implementation: ContractInfo["implementation"] = null): ContractInfo {
  return { name, abi, implementation };
}

describe("abi-source", () => {
  afterEach(() => sinon.restore());

  describe("fetchAbiFromEtherscan", () => {
    let readImplementationOnChain: sinon.SinonStub;

    beforeEach(() => {
      readImplementationOnChain = sinon.stub(deps, "readImplementationOnChain").resolves(null);
    });

    it("follows a proxy to the implementation reported by the chain, ignoring a stale Etherscan field", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI, IMPLEMENTATION));
      resolve.withArgs("mainnet", UPGRADED_IMPLEMENTATION).resolves(contractInfo("StakingRouter", STAKING_ROUTER_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(UPGRADED_IMPLEMENTATION);

      const resolved = await fetchAbiFromEtherscan("mainnet", PROXY);

      assert.deepEqual(resolved.abi, STAKING_ROUTER_ABI);
      assert.equal(resolved.contractName, "StakingRouter");
      assert.equal(
        resolved.source,
        `Etherscan, mainnet ${PROXY} (OssifiableProxy) → implementation ${UPGRADED_IMPLEMENTATION} (StakingRouter)`,
      );
      assert.isFalse(resolve.calledWith("mainnet", IMPLEMENTATION));
    });

    it("stops on a proxy chain that loops back", async () => {
      const resolve = sinon.stub(deps, "resolveContractInfo");
      resolve.withArgs("mainnet", PROXY).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      resolve.withArgs("mainnet", IMPLEMENTATION).resolves(contractInfo("OssifiableProxy", PROXY_ABI));
      readImplementationOnChain.withArgs("mainnet", PROXY, true).resolves(IMPLEMENTATION);
      readImplementationOnChain.withArgs("mainnet", IMPLEMENTATION, true).resolves(PROXY.toLowerCase());

      await assert.isRejected(fetchAbiFromEtherscan("mainnet", PROXY), /loops back to/);
    });
  });
});
