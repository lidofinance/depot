import { Log } from "ethers";
import { Receipt } from "web3-types";
import { assert } from "../../common/assert";
import votes, { event } from "../../votes";
import { OmnibusAction } from "../omnibus-action";
import { Contracts } from "../../contracts/contracts";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";
import { parseLog } from "../../votes/events";

const newPeriodTopic = "0xe183df4530c4b573af76d47f020d4b86e418cef40ed4c9ce924b563e791b832c";

// TODO: raise verbosity: display the events that were not found and unexpected logs.
export const checkOmnibusEvents = (
  contracts: Contracts<typeof LidoOnMainnet>,
  actions: OmnibusAction<any>[],
  receipt: Receipt,
) => {
  const expectedOmnibusEvents = [event(contracts.voting, "ScriptResult"), event(contracts.voting, "ExecuteVote")];

  let logs = (receipt.logs as Log[]).filter((log) => log.topics[0] !== newPeriodTopic); //TODO!!! Temporary fix for the new period event

  for (const action of actions) {
    const expectedEvents = action.getExpectedEvents();
    const actionLogs = logs.slice(0, expectedEvents.length);
    logs = logs.slice(expectedEvents.length);

    const foundSubsequence = votes.subsequence(actionLogs, expectedEvents, 0);
    const absentEvents = expectedEvents.filter((_, i) => foundSubsequence[i] === -1);

    assert.equal(
      absentEvents.length,
      0,
      `Events for action ${action.constructor.name} not found:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
    );
  }

  //Check the remaining logs for omnibus events
  const votingLogs = logs.slice(0, expectedOmnibusEvents.length);
  logs = logs.slice(expectedOmnibusEvents.length);

  const foundSubsequence = votes.subsequence(votingLogs, expectedOmnibusEvents, 0);
  const absentEvents = expectedOmnibusEvents.filter((_, i) => foundSubsequence[i] === -1);
  assert.equal(
    absentEvents.length,
    0,
    `Events for voting not found:\n${absentEvents.map((e) => e.fragment.name).join("\n")}`,
  );

  // Check that there are no unexpected logs
  assert.isEmpty(logs, "Unexpected logs");
};
