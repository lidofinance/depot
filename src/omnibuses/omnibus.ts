import { AbiEvent, AbiFunction, Address, formatAbiItem } from "abitype";
import {
  EvmScriptParser,
  getExecuteReceipt,
  passAragonVote,
  setupLdoHolder,
  startAragonVote,
} from "../aragon-votes-tools";
import bytes, { HexStrNonPrefixed, HexStrPrefixed } from "../common/bytes";
import { DevRpcClient, NetworkName, RpcClient, WriteContractOptions } from "../network";
import { TxTrace, TxTraceCallItem, TxTraceItem, TxTraceLogItem } from "../traces/tx-traces";
import { OmnibusDirectCallFactory, OmnibusDirectCall } from "./calls/omnibus-direct-call";
import { OmnibusExecuteCall, OmnibusExecuteCallFactory } from "./calls/omnibus-execute-call";
import { OmnibusForwardCalls, OmnibusForwardCallsFactory } from "./calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall, OmnibusSubmitProposalCallFactory } from "./calls/omnibus-submit-calls";
import { OmnibusForwardCall, OmnibusForwardCallFactory } from "./calls/omnibus-forward-call";
import { Contract, getEventAbi, getFunctionAbi, OmnibusBaseContract } from "../contracts";
import blueprints, { Blueprints } from "./blueprints";
import { Agent_ABI } from "../../abi/Agent.abi";
import { FilterAbiEvents, FindEventAbiParams } from "../types/abi.types";
import { Artifacts } from "hardhat/types";
import { createTimedSpinner } from "../common/spinner";
import {
  decodeEventLog,
  decodeFunctionData,
  encodeEventTopics,
  Log,
  toFunctionSelector,
  TransactionReceipt,
} from "viem";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { processPendingProposals, ProposalStatus } from "./dual-governance";
import checks from "./checks";
import chalk from "chalk";
import { assert } from "chai";
import deepEqual from "deep-eql";
import { trace } from "../traces";
import { CallEvmOpcodes, isCallOpcode, isLogOpcode } from "../traces/evm-opcodes";
import { CallsScript_ABI } from "../../abi/CallsScript.abi";
import { Voting_ABI } from "../../abi/Voting.abi";
import { Executor_ABI } from "../../abi/Executor.abi";
import { EmergencyProtectedTimelock_ABI } from "../../abi/EmergencyProtectedTimelock.abi";
import fmt from "../common/format";
import { getGovernanceContracts, GovernanceContracts } from "./governance-contracts";

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = Object.freeze({
  padLength: 0,
});

export interface FormatOptions {
  padLength?: number;
  trace?: TxTrace;
}

export interface BaseOmnibusCall {
  getTarget(): Address;
  getCalldata(): HexStrNonPrefixed;
  getExpectedEvents(phase: "vote" | "proposal"): OmnibusCallEvent[];
  format(formatOptions?: FormatOptions): string;
  formatTitle(formatOptions?: FormatOptions): string;
  formatCall(formatOptions?: FormatOptions): string;
}

export interface OmnibusCallEvent {
  abi: AbiEvent;
  args: unknown[];
  emitter: Address;
  isOptional: boolean;
  allowMultiple: boolean;
}

type OmnibusCall =
  | OmnibusDirectCall
  | OmnibusForwardCall
  | OmnibusExecuteCall
  | OmnibusForwardCalls
  | OmnibusSubmitProposalCall;

interface OmnibusFormatParams {
  executeOmnibusTrace?: TxTrace;
  executeProposalTraces?: TxTrace[];
  padLength?: number;
}

export type BlueprintCtx = Pick<OmnibusConfigCtx, "event" | "directCall">;

// The voting will be bound to the method at the construction of the omnibus
interface OmnibusConfigCtx<$DeployedContracts extends Record<string, Contract> = Record<string, Contract>> {
  event: typeof event;
  directCall: OmnibusDirectCallFactory["create"];
  executeCall: OmnibusExecuteCallFactory["create"];
  forwardCall: OmnibusForwardCallFactory["create"];
  forwardCalls: OmnibusForwardCallsFactory["create"];
  submitCalls: OmnibusSubmitProposalCallFactory["create"];
  blueprints: Blueprints;
  deployment: $DeployedContracts;
}

interface DeployOmnibusContractCtx {
  client: RpcClient;
  deployContract: <T extends Contract>(contractName: string, args: unknown[]) => Promise<T>;
}

interface OmnibusConfig<$Network extends NetworkName, $DeployedContracts extends Record<string, Contract>> {
  network: $Network;

  /**
   * When the omnibus was launched, contains the id of the vote.
   */
  voteId?: number;

  /**
   * Contains the info about the omnibus launching - the number of the block where the omnibus was launched.
   */
  launchedAt?: number | undefined;
  /**
   * Contains the info about the omnibus quorum - was it reached during the vote or not.
   */
  quorumReached?: boolean;
  /**
   * Contains the info about the omnibus execution - the number of the block with execution transaction.
   */
  executedAt?: number | undefined;

  calls: (ctx: OmnibusConfigCtx<$DeployedContracts>) => OmnibusCall[];
  testVote: TestVoteFn<$DeployedContracts>;
  testProposal?: TestProposalFn<$DeployedContracts>;

  deploy?: (ctx: DeployOmnibusContractCtx) => Promise<$DeployedContracts>;
  deployment?: $DeployedContracts;
}

interface VoteCall {
  title: string;
  target: Address;
  payload: HexStrPrefixed;
}

interface TestVoteFn<$DeployedContracts extends Record<string, Contract>> {
  (ctx: TestVoteFnCtx<$DeployedContracts>): Promise<void>;
}

interface PassProposalResult {
  executeReceipts: TransactionReceipt[];
}

interface TestFnCommonCtx<$DeployedContracts extends Record<string, Contract>> {
  client: DevRpcClient;
  checks: BoundChecks;
  deployment: $DeployedContracts;
}

interface TestVoteFnCtx<$DeployedContracts extends Record<string, Contract>>
  extends TestFnCommonCtx<$DeployedContracts> {
  passOmnibus: () => Promise<PassVoteResult>;
}

interface TestProposalFnCtx<$DeployedContracts extends Record<string, Contract>>
  extends TestFnCommonCtx<$DeployedContracts> {
  submittedProposalIds: bigint[];
  passProposals: (proposalIds?: bigint[]) => Promise<PassProposalResult>;
}

export interface TestProposalFn<$DeployedContracts extends Record<string, Contract>> {
  (ctx: TestProposalFnCtx<$DeployedContracts>): Promise<void>;
}

type BoundChecks = {
  [K in keyof typeof checks]: BindFirstParam<(typeof checks)[K]>;
};

type BindFirstParam<R extends Record<string, (...args: any[]) => any>> = {
  [K in keyof R]: R[K] extends (first: any, ...rest: infer Args) => infer Return ? (...args: Args) => Return : never;
};

interface PassVoteResult {
  voteId: bigint;
  executeReceipt: TransactionReceipt;
  submittedProposalIds: bigint[];
}

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

    const { callsScript, voting, adminExecutor, timelock } = this.#contracts;

    const directCallFactory = new OmnibusDirectCallFactory(voting, callsScript);
    const executeCallFactory = new OmnibusExecuteCallFactory(voting, callsScript);
    const forwardCallFactory = new OmnibusForwardCallFactory(voting, callsScript);
    const forwardCallsFactory = new OmnibusForwardCallsFactory(callsScript);
    const submitProposalCallFactory = new OmnibusSubmitProposalCallFactory(this.#contracts);

    const blueprintCtx: BlueprintCtx = {
      event: event,
      directCall: directCallFactory.create.bind(directCallFactory),
    };

    const blueprintsBound: any = {};
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
      blueprints: blueprintsBound,
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

      let spinner = createTimedSpinner(`Retrieving trace for execution of vote ${voteId}...`);
      const fullTrace = await trace(client, executeVoteReceipt.transactionHash);
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
        spinner = createTimedSpinner(`Process pending DG proposals...`);
        executeProposalReceipts = await processPendingProposals(client, submittedProposalIds);
        spinner.succeed(`Pending DG proposals "${submittedProposalIds}" successfully executed.`);

        if (executeProposalReceipts.length !== submittedProposalIds.length) {
          throw new Error("Invalid proposal receipts count");
        }

        spinner = createTimedSpinner(`Retrieving traces for executed DG proposals...`);
        traces = await Promise.all(
          executeProposalReceipts.map((receipt) =>
            trace(client, receipt.transactionHash, Object.values(this.#deployment ?? {})),
          ),
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
    let submittedProposalIds: bigint[] = [];

    async function passProposals(proposalIds: bigint[] = submittedProposalIds) {
      executeProposalReceipts = await processPendingProposals(client, proposalIds);
      return { executeReceipts: executeProposalReceipts };
    }

    function testEmittedEvents(logItems: Log[], omnibusEvents: OmnibusCallEvent[]) {
      let logIndex = 0;
      let eventIndex = 0;

      while (eventIndex < omnibusEvents.length) {
        const event = omnibusEvents[eventIndex];
        const { skipped } = assertEventWithLog(logItems[logIndex], event);

        // if optional event may be emitted multiple times, try to match it with log until it allows
        if (skipped || !event.allowMultiple) {
          eventIndex++;
        }

        if (skipped) {
          console.log(
            fmt.padded(`${chalk.yellowBright("✗")} ${eventIndex}. ${formatOmnibusCallEvent(event, skipped)}`, 3),
          );
        } else {
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

    const checksBound: any = {};
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

    let snapshot = await client.snapshot();
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
            checks: checksBound,
            // TODO: fixme, check deployment is not null if the deploy logic contained in the config
            deployment: this.#deployment!,
          });
          console.log(
            fmt.padded(
              `${chalk.greenBright("✔")} Aragon Vote test successfully passed. Executed vote id ${voteId}`,
              2,
            ),
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
            checks: checksBound,
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
    const [extraCalls, callTraces] = executeOmnibusTrace
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

    if (this.#contractVoteCalls.length !== this.getCalls().length) {
      throw new Error(`Unexpected vote calls count`);
    }

    for (let i = 0; i < this.getCalls().length; ++i) {
      const omnibusCall = this.getCalls()[i];
      const voteCall = this.#contractVoteCalls[i];
      if (omnibusCall instanceof OmnibusDirectCall) {
        this.#validateVoteDirectCall(omnibusCall, voteCall);
      } else if (omnibusCall instanceof OmnibusForwardCalls) {
        this.#validateVoteForwardCalls(omnibusCall, voteCall);
      } else if (omnibusCall instanceof OmnibusSubmitProposalCall) {
        this.#validateVoteSubmitCalls(omnibusCall, voteCall);
      } else if (omnibusCall instanceof OmnibusExecuteCall) {
        this.#validateVoteExecuteCall(omnibusCall, voteCall);
      } else {
        throw new Error(`Unexpected omnibus call type`);
      }
    }
  }

  #validateVoteDirectCall(omnibusCall: OmnibusDirectCall, voteCall: VoteCall) {
    if (!bytes.isEqual(omnibusCall.getTarget(), voteCall.target)) {
      throw new Error(`Omnibus target is not equal`);
    }
    if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
      throw new Error(`Omnibus payload for call "${omnibusCall.title}" is not equal`);
    }
    if (omnibusCall.title !== voteCall.title) {
      throw new Error(`Unexpected title: ${omnibusCall.title} != ${voteCall.title}`);
    }
  }

  #validateVoteForwardCall(omnibusCall: OmnibusForwardCall, voteCall: VoteCall) {
    if (!bytes.isEqual(omnibusCall.forwarder.address, voteCall.target)) {
      throw new Error(`Invalid forwarder address`);
    }

    const decodedForwardCall = decodeFunctionData({
      abi: Agent_ABI,
      data: voteCall.payload,
    });

    if (decodedForwardCall.functionName !== "forward") {
      throw new Error("Unexpected calldata method");
    }

    const evmScript = decodedForwardCall.args[0];

    const forwardedCall = omnibusCall.call;
    const { calls: evmScriptCalls } = EvmScriptParser.decode(evmScript);

    if (evmScriptCalls.length !== 1) {
      throw new Error(`Unexpected calls length`);
    }

    if (forwardedCall.title !== voteCall.title) {
      throw new Error(`Unexpected title: ${forwardedCall.title} != ${voteCall.title}`);
    }

    this.#validateVoteDirectCall(forwardedCall, {
      title: forwardedCall.title,
      payload: evmScriptCalls[0].calldata,
      target: evmScriptCalls[0].address,
    });

    if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
      throw new Error(`Invalid calldata`);
    }
  }

  #validateVoteForwardCalls(omnibusCall: OmnibusForwardCalls, voteCall: VoteCall) {
    if (!bytes.isEqual(omnibusCall.forwarder.address, voteCall.target)) {
      throw new Error(`Invalid forwarder address`);
    }

    const decodedForwardCall = decodeFunctionData({
      abi: Agent_ABI,
      data: voteCall.payload,
    });

    if (decodedForwardCall.functionName !== "forward") {
      throw new Error("Unexpected calldata method");
    }

    const evmScript = decodedForwardCall.args[0];

    const forwardedCalls = omnibusCall.forwardedCalls;
    const { calls: evmScriptCalls } = EvmScriptParser.decode(evmScript);

    if (forwardedCalls.length !== evmScriptCalls.length) {
      throw new Error(`Unexpected calls length`);
    }

    const [forwardCallTitle, ...callTitles] = voteCall.title.split("\n").map((t) => t.trim());

    if (omnibusCall.title !== forwardCallTitle) {
      throw new Error(`Unexpected title: ${omnibusCall.title} != ${forwardCallTitle}`);
    }

    if (callTitles.length !== omnibusCall.forwardedCalls.length) {
      throw new Error(`Unexpected titles count`);
    }

    for (let i = 0; i < evmScriptCalls.length; ++i) {
      const title = callTitles[i];
      this.#validateVoteDirectCall(omnibusCall.forwardedCalls[i], {
        title: callTitles[i],
        payload: evmScriptCalls[i].calldata,
        target: evmScriptCalls[i].address,
      });
    }

    if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
      throw new Error(`Invalid calldata`);
    }
  }

  #validateVoteExecuteCall(omnibusCall: OmnibusExecuteCall, voteCall: VoteCall) {
    if (!bytes.isEqual(omnibusCall.executor.address, voteCall.target)) {
      throw new Error(`Invalid forwarder address`);
    }

    const decodedForwardCall = decodeFunctionData({
      abi: Agent_ABI,
      data: voteCall.payload,
    });

    if (decodedForwardCall.functionName !== "execute") {
      throw new Error("Unexpected calldata method");
    }

    if (!bytes.isEqual(omnibusCall.call.getTarget(), decodedForwardCall.args[0])) {
      throw new Error(`Invalid execute call target`);
    }

    if (omnibusCall.getValue() !== decodedForwardCall.args[1]) {
      throw new Error(`Invalid execute call value`);
    }

    if (!bytes.isEqual(omnibusCall.call.getCalldata(), decodedForwardCall.args[2])) {
      throw new Error(`Invalid execute call payload`);
    }

    if (omnibusCall.call.title !== voteCall.title) {
      throw new Error(`Invalid execute call title`);
    }
  }

  #validateVoteSubmitCalls(omnibusCall: OmnibusSubmitProposalCall, voteCall: VoteCall) {
    if (!bytes.isEqual(omnibusCall.governance.address, voteCall.target)) {
      throw new Error(`Invalid forwarder address`);
    }

    // handle call to submit proposal
    const decodedSubmitProposalCall = decodeFunctionData({
      abi: DualGovernance_ABI,
      data: voteCall.payload,
    });

    if (decodedSubmitProposalCall.functionName !== "submitProposal") {
      throw new Error("Unexpected calldata method");
    }

    const [proposalCalls, description] = decodedSubmitProposalCall.args;

    const [submitCallTitle, ...callsTitles] = description.split("\n").map((desc) => desc.trim());

    if (submitCallTitle !== omnibusCall.title) {
      throw new Error(`Unexpected titles: expected "${submitCallTitle}", actual "${omnibusCall.title}"`);
    }

    if (proposalCalls.length !== omnibusCall.calls.length) {
      throw new Error(`Unexpected number of calls`);
    }

    let descLineStartIndex = 0;
    for (let i = 0; i < proposalCalls.length; ++i) {
      const call = omnibusCall.calls[i];
      const proposalCall = proposalCalls[i];

      if (call instanceof OmnibusDirectCall ? call.getValue() : 0n !== proposalCall.value) {
        throw new Error(`Unexpected value`);
      }

      if (call instanceof OmnibusDirectCall) {
        this.#validateVoteDirectCall(call, {
          target: proposalCall.target,
          payload: proposalCall.payload,
          title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
        });
      } else if (call instanceof OmnibusForwardCalls) {
        this.#validateVoteForwardCalls(call, {
          target: proposalCall.target,
          payload: proposalCall.payload,
          title: callsTitles
            .slice(descLineStartIndex, (descLineStartIndex += call.forwardedCalls.length + 1))
            .join("\n"),
        });
      } else if (call instanceof OmnibusExecuteCall) {
        this.#validateVoteExecuteCall(call, {
          target: proposalCall.target,
          payload: proposalCall.payload,
          title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
        });
      } else if (call instanceof OmnibusForwardCall) {
        this.#validateVoteForwardCall(call, {
          target: proposalCall.target,
          payload: proposalCall.payload,
          title: callsTitles.slice(descLineStartIndex, (descLineStartIndex += 1)).join("\n"),
        });
      } else {
        throw new Error("Unexpected call type");
      }
    }

    if (!bytes.isEqual(omnibusCall.getCalldata(), voteCall.payload)) {
      throw new Error(`Invalid calldata: ${omnibusCall.getCalldata()} != ${voteCall.payload}`);
    }
  }
}

export function groupOmnibusTraceCalls(items: OmnibusCall[], trace: TxTrace) {
  let voteCallIndices: number[] = [];

  const callTraces: TxTrace[] = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    const startIndex = trace.calls.findIndex(
      (opCode) =>
        (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
        bytes.isEqual(opCode.address, item.getTarget()) &&
        bytes.isEqual(opCode.input, item.getCalldata()),
    );
    voteCallIndices.push(startIndex);
  }

  for (let ind = 0; ind < voteCallIndices.length; ++ind) {
    callTraces.push(trace.slice(voteCallIndices[ind], voteCallIndices[ind + 1]));
  }

  if (items.length !== callTraces.length) {
    throw new Error("Unexpected call traces length");
  }
  const extraCallsTrace = voteCallIndices.length > 0 ? trace.slice(0, voteCallIndices[0]) : null;
  return [extraCallsTrace, callTraces] as const;
}

interface CustomEventArgCheck<$ArgType> {
  (arg: $ArgType): void;
}

type PartialArray<T extends readonly unknown[]> = T extends readonly [infer A, ...infer Tail]
  ? [A | CustomEventArgCheck<A> | null, ...PartialArray<Tail>]
  : T extends readonly []
    ? []
    : (T[number] | CustomEventArgCheck<T[number]> | null)[];

export function event<$Contract extends Contract, $EventName extends FilterAbiEvents<$Contract["abi"]>["name"]>(
  contract: $Contract,
  eventName: $EventName,
  args: PartialArray<FindEventAbiParams<$Contract["abi"], $EventName>>,
  options: { emitter?: Address; isOptional?: boolean; allowMultiple?: boolean } = {},
): OmnibusCallEvent {
  return {
    // TODO: consider case when contract have overloaded event
    abi: getEventAbi(contract, eventName),
    emitter: options.emitter ?? contract.address,
    args: args as unknown[],
    isOptional: options.isOptional ?? false,
    allowMultiple: options.allowMultiple ?? false,
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

function assertEventWithLog(actualLog: Log, expectedEvent: OmnibusCallEvent): { skipped: boolean } {
  const [expectedTopic] = encodeEventTopics({ abi: [expectedEvent.abi], eventName: expectedEvent.abi.name });

  if (!bytes.isEqual(actualLog.topics[0]!, expectedTopic)) {
    if (expectedEvent.isOptional) {
      return { skipped: true };
    }
    throw new Error(`Unexpected log for the "${formatAbiItem(expectedEvent.abi)}"`);
  }
  const decodedEvent = decodeEventLog({
    abi: [expectedEvent.abi],
    topics: actualLog.topics,
    data: actualLog.data,
  });

  if (decodedEvent.eventName !== expectedEvent.abi.name) {
    throw new Error(`Event name mismatch`);
  }

  const decodedArgNames = Object.keys(decodedEvent.args ?? {});
  const decodedArgValues = Object.values(decodedEvent.args ?? {});

  if (decodedArgNames.length !== expectedEvent.abi.inputs.length) {
    throw new Error("Unexpected args length");
  }

  for (let k = 0; k < expectedEvent.abi.inputs.length; ++k) {
    if (expectedEvent.args[k] === null) {
      continue;
    }
    const input = expectedEvent.abi.inputs[k];
    const argIndex = decodedArgNames.findIndex((argName) => argName === input.name);
    if (argIndex === -1) {
      throw new Error(`Arg with name "${input.name}" not found`);
    }
    const argValue = decodedArgValues[argIndex];

    const eventArg = expectedEvent.args[k];
    if (eventArg instanceof Function) {
      // custom argument check
      eventArg(argValue);
    } else {
      const isDeepEqual = bytes.isValid(argValue)
        ? bytes.isEqual(argValue, expectedEvent.args[k] as string)
        : deepEqual(argValue, expectedEvent.args[k], {
            comparator: (leftHandOperand, rightHandOperand) => {
              if (bytes.isValid(leftHandOperand) && bytes.isValid(rightHandOperand)) {
                return bytes.isEqual(leftHandOperand, rightHandOperand);
              }
              return null;
            },
          });
      if (!isDeepEqual) {
        throw new Error(`${formatAbiItem(expectedEvent.abi)} args mismatch: ${argValue} != ${expectedEvent.args[k]}`);
      }
    }
  }
  return { skipped: false };
}

interface MethodCallConfig {
  type: CallEvmOpcodes;
  address: Address;
  abi: AbiFunction;
}

export function filterOmnibusTrace(trace: TxTrace) {
  // const impls = getLidoImpls(trace.network);
  const contracts = getGovernanceContracts(trace.network);

  return trace
    .filter(omitProxyDelegateCalls())
    .filter(
      omitViewMethodCalls([
        contracts.locator,
        // impls.lidoLocator,
        contracts.kernel,
        // impls.kernel,
        contracts.evmScriptRegistry,
        // impls.evmScriptRegistry,
        contracts.acl,
        // impls.acl,
        contracts.ldo,
      ]),
    )
    .filter(
      omitMethodCalls([
        {
          type: "DELEGATECALL",
          address: contracts.callsScript.address,
          abi: getFunctionAbi(contracts.callsScript, "execScript"),
        },
      ]),
    )
    .filter(omitStaticCalls())
    .filter(omitAragonServiceLogs())
    .filter(omitDualGovernanceServiceLogs());
}

function omitViewMethodCalls(contracts: Contract[]) {
  return (traceItem: TxTraceItem) => {
    if (!isCallOpcode(traceItem.type)) return true;

    for (const { abi, address } of contracts) {
      if (!bytes.isEqual(traceItem.address, address)) {
        continue;
      }

      const viewAndPureAbiItems = abi.filter(
        (abiItem) =>
          abiItem.type === "function" && (abiItem.stateMutability === "pure" || abiItem.stateMutability === "view"),
      );

      const isSomeMatch = viewAndPureAbiItems.some((abiItem) =>
        bytes.isEqual(
          toFunctionSelector(abiItem as AbiFunction),
          bytes.slice((traceItem as TxTraceCallItem).input, 0, 4),
        ),
      );
      if (isSomeMatch) {
        return false;
      }
    }

    return true;
  };
}

function omitStaticCalls() {
  return (opCode: TxTraceItem) => {
    return opCode.type !== "STATICCALL";
  };
}

function omitProxyDelegateCalls() {
  return (txTraceItem: TxTraceItem, i: number, txTraceItems: TxTraceItem[]) => {
    if (txTraceItem.type !== "DELEGATECALL") return true;

    let parentCallIndex = i - 1;
    while (parentCallIndex >= 0) {
      const prevCall = txTraceItems[parentCallIndex];
      if (prevCall.depth < txTraceItem.depth - 1) {
        parentCallIndex = -1;
        break;
      }
      if ((prevCall.type === "CALL" || prevCall.type === "STATICCALL") && prevCall.depth === txTraceItem.depth - 1) {
        break;
      }
      parentCallIndex -= 1;
    }

    if (parentCallIndex < 0) return true;

    const parentTraceItem = txTraceItems[parentCallIndex];
    if (parentTraceItem.type !== "CALL" && parentTraceItem.type !== "STATICCALL") return true;
    return txTraceItem.input !== parentTraceItem.input && txTraceItem.output === parentTraceItem.output;
  };
}

function omitMethodCalls(callsToOmit: MethodCallConfig[]) {
  return (txTraceItem: TxTraceItem) => {
    if (!isCallOpcode(txTraceItem.type)) {
      return true;
    }

    return !callsToOmit.some((call) => {
      return (
        call.type === txTraceItem.type &&
        bytes.isEqual(call.address, txTraceItem.address ?? "0x") &&
        bytes.isEqual(toFunctionSelector(call.abi), bytes.slice(txTraceItem.input, 0, 4))
      );
    });
  };
}

function omitAragonServiceLogs() {
  return (txTraceItem: TxTraceItem) => {
    if (!isLogOpcode(txTraceItem.type)) return true;

    const { topics } = txTraceItem as TxTraceLogItem;

    if (topics.length === 0) return true;

    const logScriptCallTopics = encodeEventTopics({ abi: CallsScript_ABI, eventName: "LogScriptCall" });
    const scriptResultTopics = encodeEventTopics({ abi: Voting_ABI, eventName: "ScriptResult" });
    const executeVoteTopics = encodeEventTopics({ abi: Voting_ABI, eventName: "ExecuteVote" });

    return bytes.isEqual(topics[0], logScriptCallTopics[0]) ||
      bytes.isEqual(topics[0], scriptResultTopics[0]) ||
      bytes.isEqual(topics[0], executeVoteTopics[0])
      ? false
      : true;
  };
}

function omitDualGovernanceServiceLogs() {
  return (txTraceItem: TxTraceItem) => {
    if (!isLogOpcode(txTraceItem.type)) return true;

    const { topics } = txTraceItem as TxTraceLogItem;

    if (topics.length === 0) return true;

    const executedTopics = encodeEventTopics({ abi: Executor_ABI, eventName: "Executed" });
    const proposalExecutedTopics = encodeEventTopics({
      abi: EmergencyProtectedTimelock_ABI,
      eventName: "ProposalExecuted",
    });

    return bytes.isEqual(topics[0], executedTopics[0]) || bytes.isEqual(topics[0], proposalExecutedTopics[0])
      ? false
      : true;
  };
}

function formatOmnibusCallEvent(event: OmnibusCallEvent, isSkipped: boolean) {
  const argsStatuses: string[] = [];

  for (let i = 0; i < event.args.length; ++i) {
    let arg = event.args[i];

    const status = isSkipped || arg === null ? chalk.yellow("skipped") : chalk.green("checked");

    argsStatuses.push(`${chalk.gray(event.abi.inputs[i].name)}: ${status}`);
  }

  const eventName = isSkipped ? chalk.yellow(event.abi.name) : chalk.green(event.abi.name);
  const strBuilder: string[] = [eventName, "(", argsStatuses.join(", "), chalk.magenta(")")];
  return strBuilder.join("");
}
