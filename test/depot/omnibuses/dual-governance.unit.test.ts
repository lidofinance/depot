import { assert } from "chai";
import sinon from "sinon";

import { DevRpcClient } from "@/src/network";
import { processPendingProposals, ProposalStatus } from "@/src/omnibuses/dual-governance";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const { dualGovernance } = getGovernanceContracts("mainnet");

describe("processPendingProposals", () => {
  afterEach(() => sinon.restore());

  it("looks up an already executed proposal from the Aragon execution block", async () => {
    const receipt = { transactionHash: "0x01" } as never;
    const client = sinon.createStubInstance(DevRpcClient);
    client.getNetworkName.returns("mainnet");
    client.getChainTime.resolves(1);
    client.getAccounts.resolves([dualGovernance.address]);
    client.read.callsFake((_contract, name) => {
      const responses: Record<string, unknown> = {
        getAfterSubmitDelay: 0,
        getAfterScheduleDelay: 0,
        getProposalDetails: { id: 15n, status: ProposalStatus.Executed },
        getConfigProvider: dualGovernance.address,
        getGovernance: dualGovernance.address,
        getStateDetails: { effectiveState: 1 },
        getDualGovernanceConfig: {},
        getEffectiveState: 1,
      };
      return Promise.resolve(responses[name] as never);
    });
    client.getLogsInWindows.resolves([{ transactionHash: "0x01" }] as never);
    client.getTransactionReceipt.resolves(receipt);

    assert.deepEqual(await processPendingProposals(client, [15n], 900n), [receipt]);
    sinon.assert.calledOnceWithMatch(client.getLogsInWindows, { fromBlock: 900n, toBlock: undefined }, true);
    sinon.assert.notCalled(client.write);
  });
});
