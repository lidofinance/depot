import { rejects } from "node:assert/strict";
import sinon from "sinon";
import { createPublicClient, custom, encodeAbiParameters, walletActions } from "viem";

import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { contract } from "../../src/contracts";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import checks from "../../src/omnibuses/checks/staking-router";

const REGISTRY = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const REWARD = "0xF45C77EadD434612fCD93db978B3E36B0D58eC99";
const stakingModule = contract(NodeOperatorsRegistry_ABI, REGISTRY);

describe("node operator checks", () => {
  afterEach(() => sinon.restore());

  it("checks a name or active flag without requiring a reward address", async () => {
    const request = sinon
      .stub()
      .resolves(
        encodeAbiParameters(
          [
            { type: "bool" },
            { type: "string" },
            { type: "address" },
            ...Array.from({ length: 4 }, () => ({ type: "uint64" }) as const),
          ],
          [true, "Consensys", REWARD, 100n, 0n, 100n, 100n],
        ),
      );
    const client = new DevRpcClient(
      "mainnet",
      createPublicClient({ transport: custom({ request }) }).extend(walletActions),
    );

    await checks.checkNodeOperator({ client }, { stakingModule, operatorId: 21n, name: "Consensys" });
    await checks.checkNodeOperator({ client }, { stakingModule, operatorId: 21n, active: true });
    await rejects(checks.checkNodeOperator({ client }, { stakingModule, operatorId: 21n, rewardAddress: REGISTRY }));
  });

  it("checks both the target mode and validators count", async () => {
    const request = sinon.stub().resolves(
      encodeAbiParameters(
        Array.from({ length: 8 }, () => ({ type: "uint256" }) as const),
        [1n, 10n, 0n, 0n, 0n, 0n, 100n, 0n],
      ),
    );
    const client = new DevRpcClient(
      "mainnet",
      createPublicClient({ transport: custom({ request }) }).extend(walletActions),
    );
    const input = { stakingModule, operatorId: 21n, targetLimitMode: 1n, targetValidatorsCount: 10n };

    await checks.checkNodeOperatorTargetValidatorsCount({ client }, input);
    await rejects(checks.checkNodeOperatorTargetValidatorsCount({ client }, { ...input, targetLimitMode: 2n }));
    await rejects(checks.checkNodeOperatorTargetValidatorsCount({ client }, { ...input, targetValidatorsCount: 11n }));
  });
});
