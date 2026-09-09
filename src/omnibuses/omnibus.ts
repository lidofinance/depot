import { Address } from "abitype";
import {
  EvmScriptParser,
  getExecuteReceipt,
  passAragonVote,
  setupLdoHolder,
  startAragonVote,
} from "../aragon-votes-tools";
import bytes, { HexStrPrefixed } from "../common/bytes";
import { DevRpcClient, NetworkName, RpcClient, WriteContractOptions } from "../network";
import { TxTrace } from "../traces/tx-traces";
import { Contract, OmnibusBaseContract } from "../contracts";
import { OmnibusDirectCallFactory } from "./calls/omnibus-direct-call";
import { OmnibusExecuteCallFactory } from "./calls/omnibus-execute-call";
import { OmnibusForwardCallFactory } from "./calls/omnibus-forward-call";
import { OmnibusForwardCallsFactory } from "./calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall, OmnibusSubmitProposalCallFactory } from "./calls/omnibus-submit-calls";
import blueprints, { Blueprints } from "./blueprints";
import { ArtifactManager as Artifacts } from "hardhat/types/artifacts";
import { createTimedSpinner } from "../common/spinner";
import { decodeEventLog, encodeEventTopics, Log, TransactionReceipt } from "viem";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { processPendingProposals, ProposalStatus } from "./dual-governance";
import checks from "./checks";
import chalk from "chalk";
import { assert } from "chai";
import { trace } from "../traces";
import fmt from "../common/format";
import { getGovernanceContracts, GovernanceContracts } from "./governance-contracts";
import { event, assertEventWithLog, getSubmittedProposalIds, formatOmnibusCallEvent } from "./event-helpers";
import { groupOmnibusTraceCalls, filterOmnibusTrace } from "./trace-filters";
import { validateVoteCalls } from "./omnibus-validate";
import {
  BlueprintCtx,
  BoundChecks,
  DEFAULT_FORMAT_OPTIONS,
  FormatOptions,
  OmnibusCall,
  OmnibusCallEvent,
  OmnibusConfig,
  OmnibusConfigCtx,
  OmnibusFormatParams,
  VoteCall,
} from "./omnibus-types";

export type {
  BaseOmnibusCall,
  BlueprintCtx,
  BoundChecks,
  DeployOmnibusContractCtx,
  FormatOptions,
  OmnibusCall,
  OmnibusCallEvent,
  OmnibusConfig,
  OmnibusConfigCtx,
  OmnibusFormatParams,
  PassProposalResult,
  PassVoteResult,
  TestFnCommonCtx,
  TestProposalFn,
  TestProposalFnCtx,
  TestVoteFn,
  TestVoteFnCtx,
  VoteCall,
} from "./omnibus-types";

export { DEFAULT_FORMAT_OPTIONS } from "./omnibus-types";

export class Omnibus<
  $Network extends NetworkName = NetworkName,
  $DeployedContracts extends Record<string, Contract> = Record<string, Contract>,
> {
  #name: string | undefined;

  #contracts: GovernanceContracts;

  #contractVoteCalls?: VoteCall[];
  #contractEVMScript?: HexStrPrefixed;

  #deployedContracts: Record<Address, Contract> = {};
  #deployment: $DeployedContracts | null = null;
  #calls: OmnibusCall[] | null = null;

  readonly #config: OmnibusConfig<$Network, $DeployedContracts>;
  readonly #ctx: Omit<OmnibusConfigCtx, "deployment">;

  static create<
    $Network extends NetworkName = NetworkName,
    $DeployedContracts extends Record<string, Contract> = Record<string, Contract>,
  >(config: OmnibusConfig<$Network, $DeployedContracts>) {
    return new Omnibus(config);
  }

  constructor(config: OmnibusConfig<$Network, $DeployedContracts>) {
    this.#contracts = getGovernanceContracts(config.network);

    const { callsScript, voting } = this.#contracts;

    const directCallFactory = new OmnibusDirectCallFactory(voting, callsScript);
    const executeCallFactory = new OmnibusExecuteCallFactory(voting, callsScript);
    const forwardCallFactory = new OmnibusForwardCallFactory(voting, callsScript);
    const forwardCallsFactory = new OmnibusForwardCallsFactory(callsScript);
    const submitProposalCallFactory = new OmnibusSubmitProposalCallFactory(this.#contracts);

    const blueprintCtx: BlueprintCtx = {
      event: event,
      directCall: directCallFactory.create.bind(directCallFactory),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blueprintsBound: Record<string, Record<string, (...args: any[]) => unknown>> = {};
    for (const [blueprintNamespace, blueprintMethods] of Object.entries(blueprints)) {
      blueprintsBound[blueprintNamespace] = {};
      for (const [blueprintName, blueprintMethod] of Object.entries(blueprintMethods)) {
        blueprintsBound[blueprintNamespace][blueprintName] = blueprintMethod.bind(null, blueprintCtx);
      }
    }

    this.#config = Object.freeze(config);
    this.#ctx = {
      ...blueprintCtx,
      executeCall: executeCallFactory.create.bind(executeCallFactory),
      forwardCall: forwardCallFactory.create.bind(forwardCallFactory),
      forwardCalls: forwardCallsFactory.create.bind(forwardCallsFactory),
      submitCalls: submitProposalCallFactory.create.bind(submitProposalCallFactory),
      blueprints: blueprintsBound as Blueprints,
    };

    if (!this.#config.deploy) {
      this.#deployment = {} as $DeployedContracts;
    }

    if (this.#config.deployment) {
      this.#deployment = this.#config.deployment;
    }
  }

  get network() {
    return this.#config.network;
  }

  get voteId() {
    return this.#config.voteId;
  }

  get executedAt() {
    return this.#config.executedAt;
  }

  get launchedAt() {
    return this.#config.launchedAt;
  }

  get quorumReached() {
    return this.#config.quorumReached;
  }

  get name() {
    return this.#name ?? `Omnibus<${this.network}>`;
  }

  hasDeployMethod() {
    return !!this.#config.deploy;
  }

  getDeployment() {
    return this.#deployment;
  }

  getCalls() {
    if (!this.#deployment) {
      throw new Error(
        `Contract was not properly prepared for launch. Make sure "prepareOmnibus()" was called before usage`,
      );
    }
    if (!this.#calls) {
      this.#calls = this.#config.calls({ ...this.#ctx, deployment: this.#deployment });
    }
    return this.#calls;
  }

  setName(newName: string) {
    this.#name = newName;
  }

  getEvmScript() {
    if (this.getOmnibusContract()) {
      if (!this.#contractEVMScript) {
        throw new Error(`Contract data not loaded`);
      }
      return this.#contractEVMScript;
    }

    return EvmScriptParser.encode(
      this.getCalls().map((call) => ({
        address: call.getTarget(),
        calldata: call.getCalldata(),
      })),
    );
  }

  getVoteEvents(): OmnibusCallEvent[] {
    const { voting, callsScript } = this.#contracts;

    return [
      ...this.getCalls()
        .map((call) => call.getExpectedEvents("vote"))
        .flat(),
      event(voting, "ScriptResult", [
        /* executor: */ callsScript.address,
        /* script: */ this.getEvmScript(),
        /* input: */ "0x",
        /* returnData: */ "0x",
      ]),
      event(voting, "ExecuteVote", [null]),
    ];
  }

  getOmnibusContract() {
    if (!this.#config.deploy) {
      // if omnibus doesn't define deploy function, it can't be launched from contract
      return undefined;
    }
    if (!this.#deployment) {
      throw new Error(`Omnibus contracts is not deployed`);
    }
    if ("omnibus" in this.#deployment) {
      return this.#deployment.omnibus as OmnibusBaseContract;
    }
  }

  // ---
  // Omnibus Contract Methods
  // ---

  async deployOmnibusContracts(
    artifacts: Artifacts,
    client: RpcClient,
    txOptions: WriteContractOptions,
    formatOptions: Omit<FormatOptions, "trace"> = { padLength: 0 },
  ) {
    if (!this.#config.deploy) {
      throw new Error(`Omnibus doesn't have contracts to deploy`);
    }
    if (this.#config.deployment) {
      this.#deployment = this.#config.deployment;
      return this.#deployment;
    }

    const deployContract = async <T extends Contract>(name: string, args: unknown[]): Promise<T> => {
      const artifact = await artifacts.readArtifact(name);
      console.log(fmt.padded(`⏳Deploying contract ${name}...`, formatOptions.padLength));

      const address = await client.deployContract(
        {
          args,
          abi: artifact.abi,
          bytecode: bytes.normalize(artifact.bytecode),
        },
        txOptions,
      );

      console.log(
        fmt.padded(fmt.success(`Contract "${name}" was successfully deployed at ${address}`), formatOptions.padLength),
      );

      const contract = { abi: artifact.abi, address: address, label: artifact.contractName };
      this.#deployedContracts[bytes.normalize(address)] = contract;
      return contract as unknown as T;
    };

    this.#deployment = await this.#config.deploy({
      client,
      deployContract,
    });

    return this.#deployment;
  }

  async loadAndValidateOmnibusContractCalls(client: RpcClient) {
    const omnibusContract = this.getOmnibusContract();

    if (!omnibusContract) {
      throw new Error(`Omnibus doesn't contain "contract" property`);
    }

    if (!omnibusContract.address) {
      throw new Error(`Omnibus contract is not deployed. Make sure "contract.address" property is set.`);
    }

    const [calls, evmScript] = await Promise.all([
      client.read(omnibusContract, "getOmnibusCalls", []),
      client.read(omnibusContract, "getEVMScript", []),
    ]);

    const expectedEvmScript = EvmScriptParser.encode(
      calls.map((call) => ({ address: call.target, calldata: call.payload })),
    );

    if (!bytes.isEqual(expectedEvmScript, evmScript)) {
      throw new Error(`Unexpected EVM script`);
    }

    this.#contractVoteCalls = calls as VoteCall[];
    this.#contractEVMScript = evmScript;

    this.#validateVoteCalls();
  }

  async trace(client: DevRpcClient) {
    if (this.network !== client.getNetworkName()) {
      throw new Error(
        `Invalid network: Omnibus network is "${this.network}" but RPC connected to "${client.getNetworkName()}"`,
      );
    }

    const snapshotId = await client.snapshot();
    try {
      const { voteId, executeReceipt: executeVoteReceipt } = await this.#passOmnibus(client);
      const prePopulatedContracts = this.#getTracePrePopulatedContracts();

      let spinner = createTimedSpinner(`Retrieving trace for execution of vote ${voteId}...`);
      const fullTrace = await trace(client, executeVoteReceipt.transactionHash, prePopulatedContracts);
      spinner.succeed(`Trace successfully received`);

      const executeVoteTrace = filterOmnibusTrace(fullTrace);

      const submitProposalLogs = executeVoteReceipt.logs.filter((log) => {
        const proposalSubmittedTopic = encodeEventTopics({
          abi: DualGovernance_ABI,
          eventName: "ProposalSubmitted",
        })[0];
        return log.topics[0] === proposalSubmittedTopic;
      });

      const submittedProposalIds: bigint[] = submitProposalLogs.map(
        (log) =>
          decodeEventLog({
            abi: DualGovernance_ABI,
            eventName: "ProposalSubmitted",
            topics: log.topics,
            data: log.data,
          }).args.proposalId,
      );

      let executeProposalReceipts: TransactionReceipt[] = [];
      let traces: TxTrace[] = [];
      if (submittedProposalIds.length > 0) {
        const proposalStatusesBefore = await Promise.all(
          submittedProposalIds.map((proposalId) =>
            client.read(this.#contracts.timelock, "getProposalDetails", [proposalId]),
          ),
        );
        const alreadyExecutedCount = proposalStatusesBefore.filter(
          (proposal) => proposal.status === ProposalStatus.Executed,
        ).length;
        const pendingCount = submittedProposalIds.length - alreadyExecutedCount;

        spinner = createTimedSpinner(
          pendingCount === 0
            ? `DG proposals are already executed, retrieving execution receipts...`
            : `Processing pending DG proposals (${pendingCount}/${submittedProposalIds.length})...`,
        );

        executeProposalReceipts = await processPendingProposals(client, submittedProposalIds);
        if (pendingCount === 0) {
          spinner.succeed(`Retrieved execution receipts for already executed DG proposals "${submittedProposalIds}".`);
        } else if (alreadyExecutedCount === 0) {
          spinner.succeed(`DG proposals "${submittedProposalIds}" successfully executed.`);
        } else {
          spinner.succeed(
            `DG proposals "${submittedProposalIds}" processed: executed ${pendingCount}, already executed ${alreadyExecutedCount}.`,
          );
        }

        if (executeProposalReceipts.length !== submittedProposalIds.length) {
          throw new Error("Invalid proposal receipts count");
        }

        spinner = createTimedSpinner(`Retrieving traces for executed DG proposals...`);
        traces = await Promise.all(
          executeProposalReceipts.map((receipt) => trace(client, receipt.transactionHash, prePopulatedContracts)),
        );
        spinner.succeed(`Traces successfully received`);
        console.log();
      }

      const traceResult = this.format({
        executeOmnibusTrace: executeVoteTrace,
        executeProposalTraces: traces.map(filterOmnibusTrace),
      });

      console.log("Omnibus Trace:\n");
      if (traceResult.trim() === "") {
        console.log(fmt.padded("Trace is empty. Omnibus has no any calls"));
      } else {
        console.log(traceResult);
      }
    } catch (error) {
      console.error("omnibus.trace() failed with error:", error);
    } finally {
      await client.revert(snapshotId);
    }
  }

  #getTracePrePopulatedContracts(): Contract[] {
    const prePopulated: Contract[] = [...Object.values(this.#contracts), ...Object.values(this.#deployedContracts)];

    if (this.#deployment) {
      prePopulated.push(...(Object.values(this.#deployment) as Contract[]));
    }

    const uniqueByAddress = new Map<Address, Contract>();
    for (const item of prePopulated) {
      uniqueByAddress.set(bytes.normalize(item.address), item);
    }

    return Array.from(uniqueByAddress.values());
  }

  // ---
  // Testing
  // ---

  async passOmnibus(client: DevRpcClient) {
    console.log("Passing omnibus...");
    const { voteId, submittedProposalIds } = await this.#passOmnibus(client);
    console.log(`Omnibus launched, aragon vote id = ${voteId}`);
    console.log(`Passing proposals: [${submittedProposalIds}]`);
    await processPendingProposals(client, submittedProposalIds);
  }

  async test(client: DevRpcClient) {
    if (this.network !== client.getNetworkName()) {
      throw new Error(
        `Invalid network: Omnibus network is "${this.network}" but RPC connected to "${client.getNetworkName()}"`,
      );
    }

    let voteId: number | bigint | undefined = this.#config.voteId;

    let executeOmnibusReceipt: TransactionReceipt | null = null;
    let executeProposalReceipts: TransactionReceipt[] | null = null;
    const submittedProposalIds: bigint[] = [];

    async function passProposals(proposalIds: bigint[] = submittedProposalIds) {
      executeProposalReceipts = await processPendingProposals(client, proposalIds);
      return { executeReceipts: executeProposalReceipts };
    }

    function testEmittedEvents(logItems: Log[], omnibusEvents: OmnibusCallEvent[]) {
      let logIndex = 0;
      let eventIndex = 0;
      const matchedEventCounts = new Array(omnibusEvents.length).fill(0);

      while (eventIndex < omnibusEvents.length) {
        const event = omnibusEvents[eventIndex];
        const { skipped } = assertEventWithLog(logItems[logIndex], event);
        const hadMatchedBefore = matchedEventCounts[eventIndex] > 0;

        // if optional event may be emitted multiple times, try to match it with log until it allows
        if (skipped || !event.allowMultiple) {
          eventIndex++;
        }

        if (skipped) {
          // For allowMultiple events that were already matched at least once,
          // a final mismatch simply means "no more of this event".
          if (event.allowMultiple && hadMatchedBefore) {
            continue;
          }
          console.log(
            fmt.padded(`${chalk.yellowBright("✗")} ${eventIndex}. ${formatOmnibusCallEvent(event, skipped)}`, 3),
          );
        } else {
          matchedEventCounts[eventIndex]++;
          logIndex++;
          console.log(
            fmt.padded(`${chalk.greenBright("✔")} ${eventIndex}. ${formatOmnibusCallEvent(event, skipped)}`, 3),
          );
        }
      }

      if (logIndex !== logItems.length) {
        throw new Error(`Unchecked log items left`);
      }
      console.log(fmt.padded(`${chalk.greenBright("✔")} All events validated`, 3));
    }

    const checksBound: Record<string, Record<string, CallableFunction>> = {};
    for (const [checksNamespace, checksMethods] of Object.entries(checks)) {
      checksBound[checksNamespace] = {};
      for (const [checkName, checkMethod] of Object.entries(checksMethods)) {
        checksBound[checksNamespace][checkName] = checkMethod.bind(null, {
          client,
        });
      }
    }

    // ---
    // Create Mocha Test Suite
    // ---

    console.log(chalk.bold(`⏳Testing the Omnibus ${this.name} on the "${this.network}" network`));

    const snapshot = await client.snapshot();
    // ---
    // Execute & Test Aragon Vote Part
    // ---

    try {
      try {
        console.log(fmt.padded("Testing Aragon vote..."));
        if (!this.#config.executedAt) {
          await this.#config.testVote({
            client,
            passOmnibus: async () =>
              this.#passOmnibus(client, (res) => {
                voteId = res.voteId;
                executeOmnibusReceipt = res.executeReceipt;
                if (submittedProposalIds.length === 0) {
                  executeProposalReceipts = [];
                }
                submittedProposalIds.push(...res.submittedProposalIds);
              }),
            checks: checksBound as BoundChecks,
            // TODO: fixme, check deployment is not null if the deploy logic contained in the config
            deployment: this.#deployment!,
          });
          console.log(
            fmt.padded(`${chalk.greenBright("✔")} Aragon Vote test successfully passed. Executed vote id ${voteId}`, 2),
          );
        } else {
          await this.#passOmnibus(client, (res) => {
            voteId = res.voteId;
            executeOmnibusReceipt = res.executeReceipt;
            if (submittedProposalIds.length === 0) {
              executeProposalReceipts = [];
            }
            submittedProposalIds.push(...res.submittedProposalIds);
          });
        }

        console.log(fmt.padded("Testing emitted events by the Aragon vote", 2));
        if (!executeOmnibusReceipt) {
          throw new Error(`executeOmnibusReceipt is null. Make sure "testVote" method calls passOmnibus()`);
        }
        testEmittedEvents((executeOmnibusReceipt as TransactionReceipt).logs, this.getVoteEvents());
      } catch (error) {
        console.log(`${chalk.redBright("✗")} Aragon Vote test failed`);
        throw error;
      }

      // ---
      // Execute & Test Submitted Proposals
      // ---

      const submitProposalCalls = this.getCalls().filter((call) => call instanceof OmnibusSubmitProposalCall);
      const submittedProposals = await Promise.all(
        submittedProposalIds.map((proposalId) =>
          client.read(this.#contracts.timelock, "getProposalDetails", [proposalId]),
        ),
      );

      if (submitProposalCalls.length > 0 || submittedProposals.length > 0) {
        console.log(fmt.padded(`Testing submitted proposal during Aragon vote ${voteId}...`));
      }

      if (submitProposalCalls.length !== submittedProposals.length) {
        throw new Error(`Unexpected count of proposal calls`);
      }

      if (submittedProposals.length > 0 && !this.#config.testProposal) {
        console.log(
          chalk.yellowBright.bold(`Omnibus doesn't contain test for submitted proposals ${submittedProposals}`),
        );
      } else if (submittedProposals.length === 0 && this.#config.testProposal) {
        console.log(
          chalk.yellowBright.bold(`Omnibus doesn't submit any proposals but contains "testProposal" section`),
        );
      }

      const isAllProposalsExecute = submittedProposals.every(
        (submittedProposal) => submittedProposal.status === ProposalStatus.Executed,
      );
      if (isAllProposalsExecute) {
        console.log(fmt.padded(`Proposals [${submittedProposalIds}] already executed, retrieving receipts...`, 2));
        executeProposalReceipts = await processPendingProposals(client, submittedProposalIds);
      }

      if (!isAllProposalsExecute && submittedProposalIds.length > 0) {
        try {
          if (!this.#config.testProposal) {
            throw new Error(`testProposal function is not defined`);
          }

          console.log(fmt.padded(`Passing & executing proposals [${submittedProposalIds}]...`, 2));
          await this.#config.testProposal({
            client,
            passProposals,
            checks: checksBound as BoundChecks,
            submittedProposalIds,
            // TODO: fixme, check deployment is not null if the deploy logic contained in the config
            deployment: this.#deployment!,
          });
          console.log(
            fmt.padded(`${chalk.greenBright("✔")} Proposals [${submittedProposalIds}] successfully tested`, 3),
          );
        } catch (error) {
          console.log(`${chalk.redBright("✗")} Proposals [${submittedProposalIds}] test failed`);
          throw error;
        }
      }

      if (!executeProposalReceipts) {
        throw new Error(`Proposals is not executed`);
      }

      console.log(fmt.padded("Validating events emitted by the proposals execution...", 2));

      for (let i = 0; i < executeProposalReceipts.length; ++i) {
        const logs = executeProposalReceipts[i].logs;

        const events = submitProposalCalls[i].getExpectedEvents("proposal");

        const optionalEventsCount = events.filter((event) => event.isOptional).length;
        assert.isTrue(logs.length >= events.length - optionalEventsCount, "Count of logs is too low");

        testEmittedEvents(logs, events);
      }
      console.log(fmt.success(`All tests for omnibus "${this.name}" have passed successfully`));
    } catch (error) {
      throw error;
    } finally {
      await client.revert(snapshot);
    }
  }

  // ---
  // Formatting
  // ---

  formatDescription(ipfsLink?: string, { padLength }: FormatOptions = DEFAULT_FORMAT_OPTIONS) {
    const descriptionItems = this.getCalls().map((call) => call.formatTitle({ padLength }));
    return ipfsLink ? [...descriptionItems, "", ipfsLink].join("\n") : descriptionItems.join("\n");
  }

  format({ executeOmnibusTrace, executeProposalTraces = [], padLength = 0 }: OmnibusFormatParams) {
    const strBuilder: string[] = [];
    const [, callTraces] = executeOmnibusTrace
      ? groupOmnibusTraceCalls(this.getCalls(), executeOmnibusTrace)
      : [null, []];

    let executeProposalTraceIndex = 0;
    for (let i = 0; i < this.getCalls().length; ++i) {
      const callTrace = callTraces[i];
      const omnibusCall = this.getCalls()[i];

      if (omnibusCall instanceof OmnibusSubmitProposalCall) {
        strBuilder.push(omnibusCall.format({ trace: executeProposalTraces[executeProposalTraceIndex], padLength }));
        executeProposalTraceIndex += 1;
      } else {
        strBuilder.push(omnibusCall.format({ trace: callTrace, padLength }));
      }
      strBuilder.push("");
    }
    return strBuilder.join("\n");
  }

  // ---
  // Private Methods
  // ---

  async #passOmnibus(
    client: DevRpcClient,
    handleOmnibusPassed?: (params: {
      voteId: bigint;
      submittedProposalIds: bigint[];
      executeReceipt: TransactionReceipt;
    }) => void,
  ) {
    let voteId: number | bigint | undefined = this.#config.voteId;

    let submittedProposalIds: bigint[] | null = null;
    let executeOmnibusReceipt: TransactionReceipt | null = null;
    if (!voteId) {
      const testPilot = await setupLdoHolder(client);
      const res = await startAragonVote(client, this.getEvmScript(), this.formatDescription(), {
        from: testPilot,
      });
      voteId = res.voteId;
      executeOmnibusReceipt = await passAragonVote(client, BigInt(voteId));
      submittedProposalIds = getSubmittedProposalIds(executeOmnibusReceipt);
    } else if (this.#config.voteId && !this.#config.executedAt) {
      console.log(fmt.padded(`Omnibus already submitted. Executing vote with id ${voteId}`, 2));
      executeOmnibusReceipt = await passAragonVote(client, BigInt(voteId));
      submittedProposalIds = getSubmittedProposalIds(executeOmnibusReceipt);
    } else if (this.#config.voteId && this.#config.executedAt) {
      console.log(fmt.padded(`Omnibus already executed. Retrieving execution receipt...`, 2));
      executeOmnibusReceipt = await getExecuteReceipt(client, BigInt(voteId), this.#config.executedAt);
      submittedProposalIds = getSubmittedProposalIds(executeOmnibusReceipt);
    }

    if (!submittedProposalIds || !executeOmnibusReceipt) {
      throw new Error(`Unexpected state`);
    }

    if (handleOmnibusPassed) {
      handleOmnibusPassed({
        voteId: BigInt(voteId),
        submittedProposalIds,
        executeReceipt: executeOmnibusReceipt,
      });
    }

    return {
      voteId: BigInt(voteId),
      submittedProposalIds,
      executeReceipt: executeOmnibusReceipt,
    };
  }

  #validateVoteCalls() {
    if (!this.#contractVoteCalls || !this.#contractEVMScript) {
      throw new Error(`Vote calls not loaded`);
    }
    validateVoteCalls(this.getCalls(), this.#contractVoteCalls);
  }
}

export { event } from "./event-helpers";
export { groupOmnibusTraceCalls, filterOmnibusTrace } from "./trace-filters";
