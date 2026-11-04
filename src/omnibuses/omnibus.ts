import { Abi, Address } from "abitype";
import { getExecuteReceipt, passAragonVote, setupLdoHolder, startAragonVote } from "../aragon-votes-tools";
import bytes, { HexStrPrefixed } from "../common/bytes";
import { DevRpcClient, NetworkName, RpcClient, WriteContractOptions } from "../network";
import { TxTrace } from "../traces/tx-traces";
import { contract, Contract, OmnibusBaseContract } from "../contracts";
import { ArtifactManager as Artifacts } from "hardhat/types/artifacts";
import { createTimedSpinner } from "../common/spinner";
import { decodeEventLog, encodeEventTopics, TransactionReceipt } from "viem";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { OmnibusBase_ABI } from "../../abi/OmnibusBase.abi";
import { processPendingProposals, ProposalStatus } from "./dual-governance";
import checks from "./checks";
import chalk from "chalk";
import { trace } from "../traces";
import fmt from "../common/format";
import { getGovernanceContracts, GovernanceContracts } from "./governance-contracts";
import { getSubmittedProposalIds } from "./event-helpers";
import { filterOmnibusTrace } from "./trace-filters";
import { getSubmitProposalCallIndexes, readOmnibusContractCalls } from "./omnibus-contract-calls";
import { assertDgProposalDescriptions, formatVoteDescription } from "./omnibus-description";
import { LogCollector } from "./log-collector";
import { decodeSubmitProposal, ProposalEvents, VoteEvents } from "./vote-events";
import {
  BoundChecks,
  FormatOptions,
  OmnibusConfig,
  OmnibusFormatParams,
  PassVoteResult,
  UpgradeSnapshotHooks,
  VoteCall,
  VoteStage,
} from "./omnibus-types";
import { readVoteExecution, readVoteState, VoteExecution, VoteState } from "./vote-state";
import { KnownError } from "../common/errors";

export type {
  BoundChecks,
  DeployOmnibusContractCtx,
  FormatOptions,
  OmnibusCallEvent,
  OmnibusConfig,
  OmnibusFormatParams,
  PassProposalResult,
  PassVoteResult,
  TestFinalStateFn,
  TestFnCommonCtx,
  TestProposalFn,
  TestProposalFnCtx,
  TestVoteFn,
  TestVoteFnCtx,
  UpgradeSnapshotHooks,
  VoteCall,
  VoteStage,
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

  readonly #config: OmnibusConfig<$Network, $DeployedContracts>;

  static create<
    $Network extends NetworkName = NetworkName,
    $DeployedContracts extends Record<string, Contract> = Record<string, Contract>,
  >(config: OmnibusConfig<$Network, $DeployedContracts>) {
    return new Omnibus(config);
  }

  static deployedContract(address: Address): OmnibusBaseContract {
    return contract(OmnibusBase_ABI, address, "OmnibusBase");
  }

  constructor(config: OmnibusConfig<$Network, $DeployedContracts>) {
    this.#contracts = getGovernanceContracts(config.network);

    this.#config = Object.freeze(config);

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

  get upgrade() {
    return this.#config.upgrade;
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

  getContractVoteCalls(): VoteCall[] {
    if (!this.#contractVoteCalls) {
      throw new Error(
        `Vote calls are not loaded from the omnibus contract. Make sure "prepareOmnibus()" was called before usage`,
      );
    }
    return this.#contractVoteCalls;
  }

  setName(newName: string) {
    this.#name = newName;
  }

  getEvmScript() {
    if (!this.#contractEVMScript) {
      throw new Error(`Contract data not loaded. Make sure "prepareOmnibus()" was called before usage`);
    }
    return this.#contractEVMScript;
  }

  getOmnibusContract() {
    if (!this.#deployment || !("omnibus" in this.#deployment)) {
      throw new Error(`Omnibus deployment must contain an "omnibus" contract`);
    }
    return this.#deployment.omnibus as OmnibusBaseContract;
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

    this.#deployment = await this.#config.deploy({
      client,
      deployContract: <T extends Contract>(name: string, args: unknown[]) =>
        this.#deployContract<T>(artifacts, client, name, args, txOptions, formatOptions),
    });

    return this.#deployment;
  }

  /**
   * Deploys the contract of an omnibus which has no "deploy" section of its own.
   */
  async deployOmnibusContract(
    artifacts: Artifacts,
    client: RpcClient,
    contractName: string,
    txOptions: WriteContractOptions,
    formatOptions: Omit<FormatOptions, "trace"> = { padLength: 0 },
  ) {
    if (this.#config.deploy) {
      throw new Error(`Omnibus "${this.name}" deploys its contracts itself. Use "deployOmnibusContracts()" instead`);
    }

    const { abi }: { abi: Abi } = await artifacts.readArtifact(contractName);
    const constructorAbi = abi.find((abiItem) => abiItem.type === "constructor");

    if (constructorAbi && constructorAbi.inputs.length > 0) {
      throw new Error(
        `Constructor of the contract "${contractName}" takes arguments, so the omnibus has to deploy it in its ` +
          `"deploy" section`,
      );
    }

    const omnibus = await this.#deployContract<OmnibusBaseContract>(
      artifacts,
      client,
      contractName,
      [],
      txOptions,
      formatOptions,
    );

    this.#deployment = { omnibus } as unknown as $DeployedContracts;

    return this.#deployment;
  }

  async loadAndValidateOmnibusContractCalls(client: RpcClient) {
    const { calls, evmScript } = await readOmnibusContractCalls(client, this.getOmnibusContract());

    this.#contractVoteCalls = calls;
    this.#contractEVMScript = evmScript;
  }

  validateDgProposalDescriptions(markdown: string) {
    assertDgProposalDescriptions(this.getContractVoteCalls(), this.#contracts.dualGovernance.address, markdown);
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

        executeProposalReceipts = await processPendingProposals(
          client,
          submittedProposalIds,
          executeVoteReceipt.blockNumber,
        );
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
    const { voteId, submittedProposalIds, executeReceipt } = await this.#passOmnibus(client);
    console.log(`Omnibus launched, aragon vote id = ${voteId}`);
    console.log(`Passing proposals: [${submittedProposalIds}]`);
    await processPendingProposals(client, submittedProposalIds, executeReceipt.blockNumber);
  }

  /**
   * Picks the checks by the on-chain stage of `voteId`: what is not executed yet is applied on the fork,
   * what is already executed is compared with the omnibus contract and checked in its current state.
   */
  async test(
    client: DevRpcClient,
    afterExecution?: (client: DevRpcClient) => Promise<void>,
    snapshotHooks?: UpgradeSnapshotHooks,
  ): Promise<VoteStage> {
    if (this.network !== client.getNetworkName()) {
      throw new Error(
        `Invalid network: Omnibus network is "${this.network}" but RPC connected to "${client.getNetworkName()}"`,
      );
    }

    let stage: VoteStage = "not-launched";
    let vote: VoteState | undefined;
    let execution: VoteExecution | null = null;
    if (this.#config.voteId !== undefined) {
      const onChainVoteId = BigInt(this.#config.voteId);
      vote = await this.#readLaunchedVote(client, onChainVoteId);
      stage = "voting";
      if (vote.executed) {
        execution = await readVoteExecution(client, onChainVoteId, vote.snapshotBlock);
        const cancelled = execution.proposals.find((proposal) => proposal.status === ProposalStatus.Cancelled);
        if (cancelled) {
          throw new KnownError(`Proposal ${cancelled.id} is cancelled, nothing to test`);
        }
        stage = execution.proposals.every((proposal) => proposal.status === ProposalStatus.Executed)
          ? "executed"
          : "dg-pending";
        await this.#assertOnChainProposalCalls(
          client,
          onChainVoteId,
          execution.proposals.map((proposal) => proposal.id),
        );
      }
    }
    if (execution && snapshotHooks) {
      throw new Error(`Upgrade snapshots need a vote whose Aragon part is not executed yet`);
    }

    let voteId: number | bigint | undefined = this.#config.voteId;

    // the collectors are shared with the test, which marks the logs it explains itself, so they are
    // kept on an object: narrowing of a local variable assigned from a callback doesn't survive
    const passed: {
      voteLogs: LogCollector | null;
      voteEvents: VoteEvents | null;
      executeBlock: bigint | null;
    } = { voteLogs: null, voteEvents: null, executeBlock: execution?.executeReceipt.blockNumber ?? null };

    const submittedProposalIds: bigint[] = execution?.proposals.map((proposal) => proposal.id) ?? [];
    const testedProposals = new Map<
      bigint,
      { receipt: TransactionReceipt; logs: LogCollector; events: ProposalEvents }
    >();

    const handleOmnibusPassed = (result: PassVoteResult) => {
      voteId = result.voteId;
      passed.voteLogs = result.logs;
      passed.voteEvents = result.voteEvents;
      passed.executeBlock = result.executeReceipt.blockNumber;
      submittedProposalIds.push(...result.submittedProposalIds);
    };

    const passProposals = async (proposalIds: bigint[] = submittedProposalIds) => {
      for (const id of proposalIds) {
        if (!submittedProposalIds.includes(id)) {
          throw new Error(`Proposal ${id} was not submitted by this vote`);
        }
      }
      if (passed.executeBlock === null) {
        throw new Error(`Vote is not executed. Make sure "testVote" method calls passOmnibus()`);
      }
      const pendingIds = proposalIds.filter((id) => !testedProposals.has(id));
      const executeReceipts = await processPendingProposals(client, pendingIds, passed.executeBlock);
      executeReceipts.forEach((receipt, index) => {
        const id = pendingIds[index];
        const logs = new LogCollector(receipt.logs);
        testedProposals.set(id, {
          receipt,
          logs,
          events: this.#createProposalEvents(logs, submittedProposalIds.indexOf(id)),
        });
      });
      const results = proposalIds.map((id) => {
        const result = testedProposals.get(id);
        if (!result) {
          throw new Error(`Proposal ${id} has no execution receipt`);
        }
        return result;
      });
      return {
        executeReceipts: results.map((result) => result.receipt),
        logs: results.map((result) => result.logs),
        proposalEvents: results.map((result) => result.events),
      };
    };

    const checksBound: Record<string, Record<string, CallableFunction>> = {};
    for (const [checksNamespace, checksMethods] of Object.entries(checks)) {
      checksBound[checksNamespace] = {};
      for (const [checkName, checkMethod] of Object.entries(checksMethods)) {
        checksBound[checksNamespace][checkName] = checkMethod.bind(null, {
          client,
        });
      }
    }
    const deployment = this.#requireDeployment();

    const summary: string[] = [];
    const checked = (name: string) => summary.push(`${chalk.greenBright("✔")} ${name}`);
    const notApplicable = (name: string, reason: string) =>
      summary.push(`${chalk.yellow("-")} ${name}: not applicable, ${reason}`);

    console.log(chalk.bold(`⏳Testing the Omnibus ${this.name} on the "${this.network}" network`));

    const snapshot = await client.snapshot();

    try {
      if (execution) {
        console.log(fmt.padded(`Aragon vote ${voteId} is executed on chain, its script matches the contract`));
        checked("on-chain vote script and DG proposal calls match the omnibus contract");
        notApplicable("testVote and Aragon vote events", "the vote is executed on chain");
      } else {
        if (vote) {
          checked("on-chain vote script matches the omnibus contract");
        }
        await snapshotHooks?.beforeExecution();
        try {
          console.log(fmt.padded("Testing Aragon vote..."));
          await this.#config.testVote({
            client,
            passOmnibus: async () => this.#passOmnibus(client, handleOmnibusPassed, vote),
            checks: checksBound as BoundChecks,
            deployment,
          });
          console.log(
            fmt.padded(`${chalk.greenBright("✔")} Aragon Vote test successfully passed. Executed vote id ${voteId}`, 2),
          );

          console.log(fmt.padded("Testing emitted events by the Aragon vote", 2));
          const { voteLogs, voteEvents } = passed;
          if (!voteLogs || !voteEvents) {
            throw new Error(`Vote is not executed. Make sure "testVote" method calls passOmnibus()`);
          }
          voteEvents.assertTail();
          voteLogs.assertNothingLeft();
          checked("testVote and Aragon vote events");
        } catch (error) {
          console.log(`${chalk.redBright("✗")} Aragon Vote test failed`);
          throw error;
        }
      }

      if (stage === "executed") {
        notApplicable("testProposal and DG proposal events", "the DG proposals are executed on chain");
      } else {
        await this.#testProposals(client, voteId, submittedProposalIds, async () => {
          if (!this.#config.testProposal) {
            throw new Error(`testProposal function is not defined for submitted proposals [${submittedProposalIds}]`);
          }
          await this.#config.testProposal({
            client,
            passProposals,
            checks: checksBound as BoundChecks,
            submittedProposalIds,
            deployment,
          });
        });

        if (submittedProposalIds.some((id) => !testedProposals.has(id))) {
          throw new Error(`Proposals are not executed`);
        }

        console.log(fmt.padded("Validating events emitted by the proposals execution...", 2));

        for (const { logs, events } of testedProposals.values()) {
          events.assertTail();
          logs.assertNothingLeft();
        }
        if (submittedProposalIds.length > 0) {
          checked("testProposal and DG proposal events");
        } else {
          notApplicable("testProposal and DG proposal events", "the vote submits no DG proposals");
        }
      }

      if (snapshotHooks) {
        await client.withSnapshot(snapshotHooks.afterExecution);
      }
      if (this.upgrade && execution) {
        notApplicable("upgrade snapshot", "the vote is executed on chain");
      }

      if (this.#config.testFinalState) {
        console.log(fmt.padded("Testing the final state...", 2));
        await this.#config.testFinalState({ client, checks: checksBound as BoundChecks, deployment });
        checked("testFinalState");
      } else {
        console.log(chalk.yellowBright.bold(`⚠ Omnibus doesn't define "testFinalState": no final-state checks`));
        notApplicable("testFinalState", "not defined");
      }

      if (afterExecution) {
        await afterExecution(client);
        checked("acceptance");
      } else {
        notApplicable("acceptance", "skipped");
      }

      console.log(fmt.padded(`Checks for the "${stage}" stage:`));
      summary.forEach((line) => console.log(fmt.padded(line, 2)));
      console.log(fmt.success(`All tests for omnibus "${this.name}" have passed successfully`));
      return stage;
    } finally {
      await client.revert(snapshot);
    }
  }

  // ---
  // Formatting
  // ---

  formatDescription(ipfsLink?: string) {
    return formatVoteDescription(
      this.getContractVoteCalls().map((call) => call.title),
      ipfsLink,
    );
  }

  format({ executeOmnibusTrace, executeProposalTraces = [], padLength = 0 }: OmnibusFormatParams) {
    const strBuilder: string[] = [this.#formatContractVoteCalls(padLength)];

    const appendTrace = (title: string, trace: TxTrace) => {
      strBuilder.push(fmt.padded(chalk.bold(title), padLength));
      strBuilder.push(trace.calls.length === 0 ? fmt.padded("(empty)", padLength + 1) : trace.format(padLength + 1));
      strBuilder.push("");
    };

    if (executeOmnibusTrace) {
      appendTrace("Vote execution trace:", executeOmnibusTrace);
    }

    executeProposalTraces.forEach((trace, index) => {
      appendTrace(`Proposal #${index + 1} execution trace:`, trace);
    });

    return strBuilder.join("\n");
  }

  // ---
  // Private Methods
  // ---

  async #deployContract<T extends Contract>(
    artifacts: Artifacts,
    client: RpcClient,
    contractName: string,
    args: unknown[],
    txOptions: WriteContractOptions,
    formatOptions: Omit<FormatOptions, "trace">,
  ): Promise<T> {
    const artifact = await artifacts.readArtifact(contractName);
    console.log(fmt.padded(`⏳Deploying contract ${contractName}...`, formatOptions.padLength));

    const address = await client.deployContract(
      {
        args,
        abi: artifact.abi,
        bytecode: bytes.normalize(artifact.bytecode),
      },
      txOptions,
    );

    console.log(
      fmt.padded(
        fmt.success(`Contract "${contractName}" was successfully deployed at ${address}`),
        formatOptions.padLength,
      ),
    );

    const contract = { abi: artifact.abi, address: address, label: artifact.contractName };
    this.#deployedContracts[bytes.normalize(address)] = contract;
    return contract as unknown as T;
  }

  /**
   * Prints the payloads as is: decoding them into a tree of calls is a separate piece of work.
   */
  #formatContractVoteCalls(padLength: number) {
    const strBuilder: string[] = [];

    this.getContractVoteCalls().forEach((call, index) => {
      strBuilder.push(fmt.padded(chalk.green.bold(`${index + 1}. ${call.title}`), padLength));
      strBuilder.push(fmt.padded(`target: ${fmt.address(call.target)}`, padLength + 1));
      strBuilder.push(fmt.padded(`payload: ${call.payload}`, padLength + 1));
      strBuilder.push("");
    });

    return strBuilder.join("\n");
  }

  /** `launchedVote` is the state of `voteId` the caller has already read. */
  async #passOmnibus(
    client: DevRpcClient,
    handleOmnibusPassed?: (result: PassVoteResult) => void,
    launchedVote?: VoteState,
  ): Promise<PassVoteResult> {
    let voteId: bigint;
    let executeOmnibusReceipt: TransactionReceipt;
    if (this.#config.voteId === undefined) {
      const testPilot = await setupLdoHolder(client);
      ({ voteId } = await startAragonVote(client, this.getEvmScript(), this.formatDescription(), {
        from: testPilot,
      }));
      executeOmnibusReceipt = await passAragonVote(client, voteId);
    } else {
      voteId = BigInt(this.#config.voteId);
      const vote = launchedVote ?? (await this.#readLaunchedVote(client, voteId));
      if (vote.executed) {
        console.log(fmt.padded(`Omnibus already executed. Retrieving execution receipt...`, 2));
        executeOmnibusReceipt = await getExecuteReceipt(client, voteId, vote.snapshotBlock);
      } else {
        console.log(fmt.padded(`Omnibus already submitted. Executing vote with id ${voteId}`, 2));
        executeOmnibusReceipt = await passAragonVote(client, voteId);
      }
    }

    const logs = new LogCollector(executeOmnibusReceipt.logs);
    const result: PassVoteResult = {
      voteId,
      submittedProposalIds: getSubmittedProposalIds(executeOmnibusReceipt),
      executeReceipt: executeOmnibusReceipt,
      logs,
      voteEvents: new VoteEvents(logs, this.getContractVoteCalls(), this.#contracts, this.getEvmScript()),
    };

    if (handleOmnibusPassed) {
      handleOmnibusPassed(result);
    }

    return result;
  }

  async #testProposals(
    client: DevRpcClient,
    voteId: number | bigint | undefined,
    submittedProposalIds: bigint[],
    runTestProposal: () => Promise<void>,
  ) {
    const submitProposalCallsCount = getSubmitProposalCallIndexes(
      this.getContractVoteCalls(),
      this.#contracts.dualGovernance.address,
    ).length;

    if (submitProposalCallsCount > 0 || submittedProposalIds.length > 0) {
      console.log(fmt.padded(`Testing submitted proposal during Aragon vote ${voteId}...`));
    }

    if (submitProposalCallsCount !== submittedProposalIds.length) {
      throw new Error(`Unexpected count of proposal calls`);
    }

    if (submittedProposalIds.length === 0) {
      if (this.#config.testProposal) {
        console.log(
          chalk.yellowBright.bold(`Omnibus doesn't submit any proposals but contains "testProposal" section`),
        );
      }
      return;
    }

    try {
      console.log(fmt.padded(`Passing & executing proposals [${submittedProposalIds}]...`, 2));
      await runTestProposal();
      console.log(fmt.padded(`${chalk.greenBright("✔")} Proposals [${submittedProposalIds}] successfully tested`, 3));
    } catch (error) {
      console.log(`${chalk.redBright("✗")} Proposals [${submittedProposalIds}] test failed`);
      throw error;
    }
  }

  /** Reads `voteId` and checks it is this omnibus' vote and can still be tested, before any fork action. */
  async #readLaunchedVote(client: RpcClient, voteId: bigint): Promise<VoteState> {
    const vote = await readVoteState(client, voteId);
    if (!bytes.isEqual(vote.script, this.getEvmScript())) {
      throw new KnownError(`On-chain script of vote ${voteId} differs from the EVM script of the omnibus contract`);
    }
    if (!vote.open && !vote.executed && !vote.canExecute) {
      throw new KnownError(`Vote ${voteId} was rejected, nothing to test`);
    }
    return vote;
  }

  async #assertOnChainProposalCalls(client: RpcClient, voteId: bigint, proposalIds: bigint[]) {
    const voteCalls = this.getContractVoteCalls();
    const expectedProposalCalls = getSubmitProposalCallIndexes(voteCalls, this.#contracts.dualGovernance.address).map(
      (index) => decodeSubmitProposal(voteCalls[index]).calls,
    );
    if (expectedProposalCalls.length !== proposalIds.length) {
      throw new Error(
        `Vote ${voteId} submitted ${proposalIds.length} DG proposal(s), ` +
          `the omnibus contract has ${expectedProposalCalls.length} "submitProposal" item(s)`,
      );
    }
    for (const [index, proposalId] of proposalIds.entries()) {
      const onChainCalls = await client.read(this.#contracts.timelock, "getProposalCalls", [proposalId]);
      const expectedCalls = expectedProposalCalls[index];
      const matches =
        onChainCalls.length === expectedCalls.length &&
        onChainCalls.every(
          (call, callIndex) =>
            bytes.isEqual(call.target, expectedCalls[callIndex].target) &&
            call.value === expectedCalls[callIndex].value &&
            bytes.isEqual(call.payload, expectedCalls[callIndex].payload),
        );
      if (!matches) {
        throw new Error(`On-chain calls of DG proposal ${proposalId} differ from the omnibus contract`);
      }
    }
  }

  #requireDeployment(): $DeployedContracts {
    if (!this.#deployment) {
      throw new Error(`Omnibus "${this.name}" contracts are not deployed`);
    }
    return this.#deployment;
  }

  #createProposalEvents(logs: LogCollector, proposalIndex: number): ProposalEvents {
    const voteCalls = this.getContractVoteCalls();
    const submitProposalIndexes = getSubmitProposalCallIndexes(voteCalls, this.#contracts.dualGovernance.address);
    const submitCall = voteCalls[submitProposalIndexes[proposalIndex]];
    if (!submitCall) {
      throw new Error(`Proposal #${proposalIndex + 1} executed, but the vote has no matching "submitProposal" item`);
    }
    return new ProposalEvents(logs, decodeSubmitProposal(submitCall).calls, this.#contracts);
  }
}

export { event } from "./event-helpers";
export { filterOmnibusTrace } from "./trace-filters";
