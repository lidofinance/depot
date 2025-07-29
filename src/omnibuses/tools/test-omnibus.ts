import checks from "../checks/checks";
import { DevRpcClient, NetworkName } from "../../network";
import {
  getLidoContracts,
  getLidoImpls,
  getLidoProxies,
  LidoContracts,
  LidoImpls,
  LidoProxies,
} from "../../contracts/contracts";
import { decodeEventLog, encodeEventTopics, Log, TransactionReceipt } from "viem";
import { Omnibus } from "../omnibus";
import { passAragonVote, setupLdoHolder } from "../../aragon-votes-tools/testing";
import { DualGovernance_ABI } from "../../../abi/DualGovernance.abi";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import { startAragonVote } from "../../aragon-votes-tools";
import chalk from "chalk";
import Mocha, { Test } from "mocha";
import { assert } from "chai";
import { processPendingProposals } from "../dual-governance";
import {
  checkOmnibusLogsGroup,
  checkProposalExecutionLogsGroup,
  groupOmnibusLogs,
  groupProposalExecutionLogs,
} from "../checks/events";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-proposal-call";

type BindFirstParam<R extends Record<string, (...args: any[]) => any>> = {
  [K in keyof R]: R[K] extends (first: any, ...rest: infer Args) => infer Return ? (...args: Args) => Return : never;
};

type BoundChecks = {
  [K in keyof typeof checks]: BindFirstParam<(typeof checks)[K]>;
};

interface TestOmnibusCtx<N extends NetworkName> {
  impls: LidoImpls<N>;
  proxies: LidoProxies<N>;
  contracts: LidoContracts<N>;
  client: DevRpcClient;
  checks: BoundChecks;
  passOmnibus: () => Promise<{ voteId: bigint; executeReceipt: TransactionReceipt; submittedProposalIds: bigint[] }>;
  passProposals: (proposalIds: bigint[]) => Promise<{ executeReceipts: TransactionReceipt[] }>;
}

export interface OmnibusTest {
  (client: DevRpcClient): Promise<void>;
}

export interface OmnibusTestFn<N extends NetworkName> {
  (ctx: TestOmnibusCtx<N>): Promise<void>;
}

export function testOmnibus<N extends NetworkName>(omnibus: Omnibus<N>, testFn: OmnibusTestFn<N>) {
  return function (client: DevRpcClient) {
    if (omnibus.network !== client.getNetworkName()) {
      throw new Error(
        `Invalid network: Omnibus network is "${omnibus.network}" but RPC connected to "${client.getNetworkName()}"`,
      );
    }

    let executeOmnibusReceipt: TransactionReceipt | null = null;
    let executeProposalReceipts: TransactionReceipt[] | null = null;
    let executedProposalIds: bigint[] = [];

    async function passOmnibus() {
      let voteId: number | bigint | undefined = omnibus.voteId;
      if (!voteId) {
        const testPilot = await setupLdoHolder(client);
        const res = await startAragonVote(client, omnibus.script, omnibus.formatSummary(), { from: testPilot });
        voteId = res.voteId;
      } else {
        console.log(`Omnibus already submitted. Executing vote with id ${voteId}`);
      }

      executeOmnibusReceipt = await passAragonVote(client, BigInt(voteId));
      const submittedProposalIds = getSubmittedProposalIds(executeOmnibusReceipt);

      if (submittedProposalIds.length === 0) {
        executeProposalReceipts = [];
      }

      return {
        voteId: BigInt(voteId),
        submittedProposalIds,
        executeReceipt: executeOmnibusReceipt,
      };
    }

    async function passProposals(proposalIds: bigint[]) {
      executeProposalReceipts = await processPendingProposals(client, proposalIds);
      executedProposalIds = [...executedProposalIds, ...proposalIds];
      return { executeReceipts: executeProposalReceipts };
    }

    const impls = getLidoImpls(omnibus.network);
    const proxies = getLidoProxies(omnibus.network);
    const contracts = getLidoContracts(omnibus.network);

    const checksBound: any = {};
    for (const [checksNamespace, checksMethods] of Object.entries(checks)) {
      checksBound[checksNamespace] = {};
      for (const [checkName, checkMethod] of Object.entries(checksMethods)) {
        checksBound[checksNamespace][checkName] = checkMethod.bind(null, { client, impls, proxies, contracts });
      }
    }

    const context: TestOmnibusCtx<N> = {
      client,
      impls,
      proxies,
      contracts,
      passOmnibus,
      passProposals,
      checks: checksBound,
    };

    let snapshot: HexStrPrefixed | null = null;
    const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });
    const rootSuite = Mocha.Suite.create(mocha.suite, chalk.bold(`Testing the Omnibus on ${omnibus.network} network`));

    rootSuite.beforeAll(async () => {
      snapshot = await client.snapshot();
    });

    rootSuite.afterAll(async () => {
      if (!snapshot) {
        throw new Error("EVM snapshot is null");
      }
      await client.revert(snapshot);
    });

    const omnibusTestSuite = Mocha.Suite.create(rootSuite, `Testing omnibus actions`);

    omnibusTestSuite.addTest(
      new Test("Testing omnibus items", async () => {
        await testFn(context);
      }),
    );

    omnibusTestSuite.afterAll(async () => {
      assert.isNotNull(executeOmnibusReceipt, "Omnibus execution receipt is null");

      const logItems: Log[] = executeOmnibusReceipt.logs;
      const logsGroup = groupOmnibusLogs(contracts.voting, logItems);

      const testOmnibusEventsSuite = Mocha.Suite.create(rootSuite, `Test omnibus emitted events`);

      testOmnibusEventsSuite.addTest(
        new Test("Validate emitted events count", async () => {
          assert.equal(
            logsGroup.length,
            omnibus.events.length,
            `Logs groups mismatch: ${logsGroup.length} !== ${omnibus.events.length}`,
          );
        }),
      );

      for (let i = 0; i < logsGroup.length; ++i) {
        const title = omnibus.calls[i].formatTitle((i + 1).toString()).split("\n")[0];
        testOmnibusEventsSuite.addTest(
          new Test(`Validate "${title}"`, async () => {
            checkOmnibusLogsGroup(logsGroup[i], omnibus.events[i]);
          }),
        );
      }
    });

    omnibusTestSuite.afterAll(() => {
      assert.isNotNull(executeProposalReceipts);

      if (executeProposalReceipts.length === 0) {
        return;
      }

      const submitProposalCalls = omnibus.calls.filter((item) => item instanceof OmnibusSubmitProposalCall);

      const testProposalsEventsSuite = Mocha.Suite.create(
        rootSuite,
        `Test logs of proposals [${executedProposalIds.join(",")}] execution`,
      );

      testProposalsEventsSuite.addTest(
        new Test(`Validate count of proposals execution`, async () => {
          assert.equal(submitProposalCalls.length, executedProposalIds.length, "Invalid executed proposals count");
        }),
      );

      for (let i = 0; i < executedProposalIds.length; ++i) {
        const testProposalEventsSuite = Mocha.Suite.create(
          testProposalsEventsSuite,
          `Test logs of proposal ${executedProposalIds[i]} execution`,
        );

        const groupedExecuteLogs = groupProposalExecutionLogs(client.getNetworkName(), executeProposalReceipts[i]);
        // console.log(groupedExecuteLogs);
        // console.log(submitProposalCalls[i].events);
        testProposalEventsSuite.addTest(
          new Test("Validate emitted events count", async () => {
            assert.equal(
              groupedExecuteLogs.length,
              submitProposalCalls[i].calls.length,
              `Logs groups mismatch: ${groupedExecuteLogs.length} !== ${submitProposalCalls[i].calls.length}`,
            );
          }),
        );

        for (let j = 0; j < groupedExecuteLogs.length; ++j) {
          const events = submitProposalCalls[i].calls[j].events;
          const title = submitProposalCalls[i].calls[j].formatTitle((i + 1).toString()).split("\n")[0];

          testProposalEventsSuite.addTest(
            new Test(`Validate "${title}"`, async () => {
              checkProposalExecutionLogsGroup(groupedExecuteLogs[i], events);
            }),
          );
        }
      }
    });

    return new Promise((resolve, reject) => {
      mocha.run((failures) => {
        if (failures) reject("some tests failed");
        resolve("success");
      });
    });
  };
}

function getSubmittedProposalIds(receipt: TransactionReceipt) {
  const submitProposalLogs = receipt.logs.filter((log) => {
    const proposalSubmittedTopic = encodeEventTopics({ abi: DualGovernance_ABI, eventName: "ProposalSubmitted" })[0];
    return log.topics[0] && bytes.isEqual(log.topics[0], proposalSubmittedTopic);
  });

  return submitProposalLogs.map(
    (log) =>
      decodeEventLog({
        abi: DualGovernance_ABI,
        eventName: "ProposalSubmitted",
        topics: log.topics,
        data: log.data,
      }).args.proposalId,
  );
}
