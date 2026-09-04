import { Address, Hex, toFunctionSelector } from "viem";

import { Agent_ABI } from "../../../../abi/Agent.abi";
import { AccessControl_ABI } from "../../../../abi/AccessControl.abi";
import { AllowedRecipientsRegistry_ABI } from "../../../../abi/AllowedRecipientsRegistry.abi";
import { BuybackAllocator_ABI } from "../../../../abi/BuybackAllocator.abi";
import { BuybackExecutor_ABI } from "../../../../abi/BuybackExecutor.abi";
import { EasyTrack_ABI } from "../../../../abi/EasyTrack.abi";
import { OracleRouter_ABI } from "../../../../abi/OracleRouter.abi";
import { OssifiableProxy_ABI } from "../../../../abi/OssifiableProxy.abi";
import { StakingRouter_ABI } from "../../../../abi/StakingRouter.abi";
import { TokenRateNotifier_ABI } from "../../../../abi/TokenRateNotifier.abi";
import { UpdateStakingModuleShareLimits_ABI } from "../../../../abi/UpdateStakingModuleShareLimits.abi";
import { assert } from "../../../../src/common/assert";
import bytes from "../../../../src/common/bytes";
import { Contract, contract, createContracts, getFunctionAbi } from "../../../../src/contracts";
import { DevRpcClient } from "../../../../src/network";
import { event, expectedEvents as ev, Omnibus } from "../../../../src/omnibuses";
import { getGovernanceContracts } from "../../../../src/omnibuses/governance-contracts";

const contracts = createContracts({
  agent: [Agent_ABI, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
  easyTrack: [EasyTrack_ABI, "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea"],
  stakingRouter: [StakingRouter_ABI, "0xFdDf38947aFB03C621C71b06C9C70bce73f12999"],
  tokenRateNotifier: [TokenRateNotifier_ABI, "0xbe05d12Fd10919F1881125006523452F6aFF791b"],
  lidoLocator: [OssifiableProxy_ABI, "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb"],
  stonksStethRegistry: [AllowedRecipientsRegistry_ABI, "0x1a7cFA9EFB4D5BfFDE87B0FaEb1fC65d653868C0"],
  lolStablecoinsRegistry: [AllowedRecipientsRegistry_ABI, "0x8d8b35cA51e7808098afF4918C21Ce428c943F89"],
  oracleRouter: [OracleRouter_ABI, "0x79ef3a538200Fe4981D67E7e886bfb36D4Cb5a31"],
  buybackExecutor: [BuybackExecutor_ABI, "0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7"],
  buybackAllocator: [BuybackAllocator_ABI, "0xAA568141c051f2D1132b110f8391F18D48E8D889"],
});
const governance = getGovernanceContracts("mainnet");

const ARAGON_FINANCE: Address = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";
const EMERGENCY_BRAKES_MULTISIG: Address = "0x73b047fe6337183A454c5217241D780a932777bD";
const TEST_RECIPIENT: Address = "0x0102030405060708091011121314151617181920";

// the vote this omnibus reproduces; its script stays in Voting storage, so the byte check works on any fork after it
const VOTE_ID = 204n;

const DAY_SECONDS = 86_400n;
const YEAR_SECONDS = 365n * DAY_SECONDS;

const ITEM_TITLES = {
  submitProposal:
    "Submit a Dual Governance proposal containing a single Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c forward call to Dual Governance 0xC1db28B3301331277e307FDCfF8DE28242A4486E",
  setOracleRouterManager:
    "Set Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 as manager on OracleRouter 0x79ef3a538200Fe4981D67E7e886bfb36D4Cb5a31",
  setStonks:
    "Set treasury-mode Stonks 0xb368586CB980895E51e1D82102E63b3F69d3F151 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
  grantAllocatorRole:
    "Grant Buybacks.BuybackExecutor.ALLOCATOR_ROLE 0x87905334ad07701d0cd9b21ea0599de1a0cab067e0ab49596d423d87159ac7f2 to BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
  grantExecutorManagerRole:
    "Grant Buybacks.MANAGER_ROLE 0x24bec1f1283f989ed510b4d89bc7ef5002f20db1b60c1b3192336791c868543e to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
  grantCommitteeEmergencyRole:
    "Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE 0xc748c205190870b4e890036f373e30556929f7fbf3db8644c998a652c1996dbd to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
  grantBrakesEmergencyRole:
    "Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE 0xc748c205190870b4e890036f373e30556929f7fbf3db8644c998a652c1996dbd to Ethereum Emergency Brakes multisig 0x73b047fe6337183A454c5217241D780a932777bD on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
  grantAllocatorManagerRole:
    "Grant Buybacks.MANAGER_ROLE 0x24bec1f1283f989ed510b4d89bc7ef5002f20db1b60c1b3192336791c868543e to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889",
  activateAllocator: "Call activate() on BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889",
  removeShareLimitsFactory:
    "Remove UpdateStakingModuleShareLimits EVM script factory 0x0C6703F1d8D9DdfB6c6e5F57b4f7432a6500D6D8 from EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
  addShareLimitsFactory:
    "Add UpdateStakingModuleShareLimits EVM script factory 0xde3e46E3129fA4e4e3f66c9024B0A3Ad509b27a1 with validateParams permission on itself and updateModuleShares permission on Staking Router 0xFdDf38947aFB03C621C71b06C9C70bce73f12999 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
  addTopUpFactory:
    "Add LOL stablecoins TopUpAllowedRecipients EVM script factory 0xc72d4C3e86b681D7c9EE306D41193C64D709C303 with newImmediatePayment permission on Aragon Finance 0xB9E5CBB9CA5b0d659238807E84D0176930753d86 and updateSpentAmount permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
  addAddRecipientFactory:
    "Add LOL stablecoins AddAllowedRecipient EVM script factory 0xe24230619e9218C1eed3de3489a22f6BC3ce18FF with addRecipient permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
  addRemoveRecipientFactory:
    "Add LOL stablecoins RemoveAllowedRecipient EVM script factory 0xF4d5D97C85eD18f77F99B57f55E9E11d52992632 with removeRecipient permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
};

// the omnibus contract is the source of every vote-scoped value; the artifact ABI is untyped, hence the casts
async function readVoteConstants(client: DevRpcClient, omnibus: Contract) {
  const constant = <T>(name: string) => client.read(omnibus, name, []) as Promise<T>;
  const [
    opStackTokenRatePusher,
    stakingRevenueSource,
    lidoLocatorImplementation,
    treasuryModeStonks,
    treasuryManagementCommittee,
    observerKindNoArgs,
    observerKindWithArgs,
    buybackAllocatorRecipientTitle,
    allocatorRole,
    managerRole,
    emergencyRole,
    addRecipientRole,
    removeRecipientRole,
    lolTopUpFactory,
    lolAddRecipientFactory,
    lolRemoveRecipientFactory,
    oldShareLimitsFactory,
    newShareLimitsFactory,
  ] = await Promise.all([
    constant<Address>("OP_STACK_TOKEN_RATE_PUSHER"),
    constant<Address>("STAKING_REVENUE_SOURCE"),
    constant<Address>("LIDO_LOCATOR_IMPLEMENTATION"),
    constant<Address>("TREASURY_MODE_STONKS"),
    constant<Address>("TREASURY_MANAGEMENT_COMMITTEE"),
    constant<number>("OBSERVER_KIND_NO_ARGS"),
    constant<number>("OBSERVER_KIND_WITH_ARGS"),
    constant<string>("BUYBACK_ALLOCATOR_RECIPIENT_TITLE"),
    constant<Hex>("BUYBACK_EXECUTOR_ALLOCATOR_ROLE"),
    constant<Hex>("BUYBACKS_MANAGER_ROLE"),
    constant<Hex>("BUYBACK_EXECUTOR_EMERGENCY_ROLE"),
    constant<Hex>("ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE"),
    constant<Hex>("REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE"),
    constant<Address>("LOL_STABLECOINS_TOP_UP_FACTORY"),
    constant<Address>("LOL_STABLECOINS_ADD_RECIPIENT_FACTORY"),
    constant<Address>("LOL_STABLECOINS_REMOVE_RECIPIENT_FACTORY"),
    constant<Address>("OLD_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY"),
    constant<Address>("NEW_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY"),
  ]);
  return {
    opStackTokenRatePusher,
    stakingRevenueSource,
    lidoLocatorImplementation,
    treasuryModeStonks,
    treasuryManagementCommittee,
    observerKindNoArgs,
    observerKindWithArgs,
    buybackAllocatorRecipientTitle,
    allocatorRole,
    managerRole,
    emergencyRole,
    addRecipientRole,
    removeRecipientRole,
    lolTopUpFactory,
    lolAddRecipientFactory,
    lolRemoveRecipientFactory,
    oldShareLimitsFactory,
    newShareLimitsFactory,
  };
}

type VoteConstants = Awaited<ReturnType<typeof readVoteConstants>>;

function asAccessControl(target: Contract) {
  return { accessControl: contract(AccessControl_ABI, target.address, target.label) };
}

function ozRoleGrants(vote: VoteConstants) {
  const buybackExecutor = asAccessControl(contracts.buybackExecutor);
  const buybackAllocator = asAccessControl(contracts.buybackAllocator);
  return [
    { contracts: buybackExecutor, role: vote.allocatorRole, account: contracts.buybackAllocator.address },
    { contracts: buybackExecutor, role: vote.managerRole, account: vote.treasuryManagementCommittee },
    { contracts: buybackExecutor, role: vote.emergencyRole, account: vote.treasuryManagementCommittee },
    { contracts: buybackExecutor, role: vote.emergencyRole, account: EMERGENCY_BRAKES_MULTISIG },
    { contracts: buybackAllocator, role: vote.managerRole, account: vote.treasuryManagementCommittee },
  ];
}

function shareLimitsFactoryPermission(factory: Address): Hex {
  return bytes.join(
    factory,
    toFunctionSelector(getFunctionAbi({ abi: UpdateStakingModuleShareLimits_ABI }, "validateParams")),
    contracts.stakingRouter.address,
    toFunctionSelector(getFunctionAbi({ abi: StakingRouter_ABI }, "updateModuleShares")),
  );
}

async function readObservers(client: DevRpcClient): Promise<Address[]> {
  const observersLength = await client.read(contracts.tokenRateNotifier, "observersLength", []);
  const observers: Address[] = [];
  for (let index = 0n; index < observersLength; index++) {
    const [observer] = await client.read(contracts.tokenRateNotifier, "observers", [index]);
    observers.push(observer);
  }
  return observers.map((observer) => bytes.normalize(observer));
}

async function withImpersonatedExecutor(client: DevRpcClient, executor: Address, run: () => Promise<void>) {
  const snapshot = await client.snapshot();
  try {
    await client.impersonate(executor, 10n ** 18n);
    await run();
  } finally {
    await client.revert(snapshot);
  }
}

/** The roles are proven by using them: the executor adds and removes a recipient. */
async function checkExecutorManagesLolRecipients(client: DevRpcClient, executor: Address) {
  const registry = contracts.lolStablecoinsRegistry;
  await withImpersonatedExecutor(client, executor, async () => {
    await client.write(registry, "addRecipient", [TEST_RECIPIENT, "Test recipient"], { from: executor });
    assert.isTrue(await client.read(registry, "isRecipientAllowed", [TEST_RECIPIENT]));
    await client.write(registry, "removeRecipient", [TEST_RECIPIENT], { from: executor });
    assert.isFalse(await client.read(registry, "isRecipientAllowed", [TEST_RECIPIENT]));
  });
}

async function checkExecutorCannotManageLolRecipients(client: DevRpcClient, executor: Address) {
  const registry = contracts.lolStablecoinsRegistry;
  await withImpersonatedExecutor(client, executor, async () => {
    const addRecipient = client.write(registry, "addRecipient", [TEST_RECIPIENT, "Test recipient"], { from: executor });
    await assert.reverts(addRecipient, "is missing role");
    const removeRecipient = client.write(registry, "removeRecipient", [TEST_RECIPIENT], { from: executor });
    await assert.reverts(removeRecipient, "is missing role");
  });
}

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const isValidVoteScript = (await client.read(deployment.omnibus, "isValidVoteScript", [VOTE_ID])) as boolean;
    assert.isTrue(isValidVoteScript, `EVM script of the contract differs from the script of vote #${VOTE_ID}`);

    const vote = await readVoteConstants(client, deployment.omnibus);
    const { buybackExecutor, buybackAllocator, lolStablecoinsRegistry, oracleRouter, easyTrack } = contracts;

    // the role hashes of the description are the ones the target contracts declare
    assert.equal(vote.allocatorRole, await client.read(buybackExecutor, "ALLOCATOR_ROLE", []));
    assert.equal(vote.managerRole, await client.read(buybackExecutor, "MANAGER_ROLE", []));
    assert.equal(vote.managerRole, await client.read(buybackAllocator, "MANAGER_ROLE", []));
    assert.equal(vote.emergencyRole, await client.read(buybackExecutor, "EMERGENCY_ROLE", []));
    assert.equal(
      vote.addRecipientRole,
      await client.read(lolStablecoinsRegistry, "ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE", []),
    );
    assert.equal(
      vote.removeRecipientRole,
      await client.read(lolStablecoinsRegistry, "REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE", []),
    );

    const managerBefore = await client.read(oracleRouter, "manager", []);
    assert.notEqual(bytes.normalize(managerBefore), bytes.normalize(vote.treasuryManagementCommittee));

    const stonksBefore = await client.read(buybackExecutor, "stonks", []);
    assert.notEqual(bytes.normalize(stonksBefore), bytes.normalize(vote.treasuryModeStonks));
    const lpModeBefore = await client.read(buybackExecutor, "lpModeEnabled", []);

    for (const grant of ozRoleGrants(vote)) {
      await checks.accessControl.checkOzRoleNotGranted(grant);
    }
    assert.equal(await client.read(buybackAllocator, "activationTS", []), 0n);

    await checks.easyTrack.checkFactoryExists(contracts, vote.oldShareLimitsFactory);
    await checks.easyTrack.checkFactoriesNotExists(contracts, [
      vote.newShareLimitsFactory,
      vote.lolTopUpFactory,
      vote.lolAddRecipientFactory,
      vote.lolRemoveRecipientFactory,
    ]);

    const { voteEvents } = await passOmnibus();

    const lpModeAfter = await client.read(buybackExecutor, "lpModeEnabled", []);
    const activationTS = await client.read(buybackAllocator, "activationTS", []);
    const lastTotalRevenueUSD = await client.read(buybackAllocator, "lastTotalRevenueUSD", []);

    voteEvents.item(ITEM_TITLES.submitProposal);
    voteEvents.item(ITEM_TITLES.setOracleRouterManager, [
      event(oracleRouter, "ManagerSet", [vote.treasuryManagementCommittee]),
    ]);
    voteEvents.item(ITEM_TITLES.setStonks, [
      event(buybackExecutor, "StonksAndOperatingModeSet", [
        stonksBefore,
        vote.treasuryModeStonks,
        lpModeBefore,
        lpModeAfter,
      ]),
    ]);
    voteEvents.item(
      ITEM_TITLES.grantAllocatorRole,
      ev.accessControl.roleGranted(buybackExecutor, { role: vote.allocatorRole, to: buybackAllocator.address }),
    );
    voteEvents.item(
      ITEM_TITLES.grantExecutorManagerRole,
      ev.accessControl.roleGranted(buybackExecutor, { role: vote.managerRole, to: vote.treasuryManagementCommittee }),
    );
    voteEvents.item(
      ITEM_TITLES.grantCommitteeEmergencyRole,
      ev.accessControl.roleGranted(buybackExecutor, { role: vote.emergencyRole, to: vote.treasuryManagementCommittee }),
    );
    voteEvents.item(
      ITEM_TITLES.grantBrakesEmergencyRole,
      ev.accessControl.roleGranted(buybackExecutor, { role: vote.emergencyRole, to: EMERGENCY_BRAKES_MULTISIG }),
    );
    voteEvents.item(
      ITEM_TITLES.grantAllocatorManagerRole,
      ev.accessControl.roleGranted(buybackAllocator, { role: vote.managerRole, to: vote.treasuryManagementCommittee }),
    );
    // activation anchors the reserve and opens the daily and yearly spending windows
    voteEvents.item(ITEM_TITLES.activateAllocator, [
      event(buybackAllocator, "ReserveAnchored", [activationTS]),
      event(buybackAllocator, "WindowRolled", [DAY_SECONDS, activationTS + DAY_SECONDS, 0n]),
      event(buybackAllocator, "WindowRolled", [YEAR_SECONDS, activationTS + YEAR_SECONDS, 0n]),
      event(buybackAllocator, "Activated", [activationTS, lastTotalRevenueUSD]),
    ]);
    voteEvents.item(
      ITEM_TITLES.removeShareLimitsFactory,
      ev.easyTrack.factoryRemoved(easyTrack, { factory: vote.oldShareLimitsFactory }),
    );
    voteEvents.item(
      ITEM_TITLES.addShareLimitsFactory,
      ev.easyTrack.factoryAdded(easyTrack, {
        factory: vote.newShareLimitsFactory,
        permission: shareLimitsFactoryPermission(vote.newShareLimitsFactory),
      }),
    );
    voteEvents.item(
      ITEM_TITLES.addTopUpFactory,
      ev.easyTrack.topUpFactoryAdded(easyTrack, {
        factory: vote.lolTopUpFactory,
        finance: ARAGON_FINANCE,
        registry: lolStablecoinsRegistry.address,
      }),
    );
    voteEvents.item(
      ITEM_TITLES.addAddRecipientFactory,
      ev.easyTrack.addRecipientFactoryAdded(easyTrack, {
        factory: vote.lolAddRecipientFactory,
        registry: lolStablecoinsRegistry.address,
      }),
    );
    voteEvents.item(
      ITEM_TITLES.addRemoveRecipientFactory,
      ev.easyTrack.removeRecipientFactoryAdded(easyTrack, {
        factory: vote.lolRemoveRecipientFactory,
        registry: lolStablecoinsRegistry.address,
      }),
    );

    const managerAfter = await client.read(oracleRouter, "manager", []);
    assert.equal(bytes.normalize(managerAfter), bytes.normalize(vote.treasuryManagementCommittee));

    const stonksAfter = await client.read(buybackExecutor, "stonks", []);
    assert.equal(bytes.normalize(stonksAfter), bytes.normalize(vote.treasuryModeStonks));

    for (const grant of ozRoleGrants(vote)) {
      await checks.accessControl.checkOzRoleGranted(grant);
    }
    assert.notEqual(activationTS, 0n);
    assert.equal(await client.read(buybackAllocator, "reserveAnchorTS", []), activationTS);

    await checks.easyTrack.checkFactoryNotExists(contracts, vote.oldShareLimitsFactory);
    await checks.easyTrack.checkFactoriesExists(contracts, [
      vote.newShareLimitsFactory,
      vote.lolTopUpFactory,
      vote.lolAddRecipientFactory,
      vote.lolRemoveRecipientFactory,
    ]);
    const shareLimitsPermissions = await client.read(easyTrack, "evmScriptFactoryPermissions", [
      vote.newShareLimitsFactory,
    ]);
    assert.equal(
      bytes.normalize(shareLimitsPermissions),
      bytes.normalize(shareLimitsFactoryPermission(vote.newShareLimitsFactory)),
    );
  },

  testProposal: async ({ client, checks, passProposals, deployment }) => {
    const vote = await readVoteConstants(client, deployment.omnibus);
    const { agent, tokenRateNotifier, lidoLocator, stonksStethRegistry, lolStablecoinsRegistry, buybackAllocator } =
      contracts;
    const evmScriptExecutor = await client.read(contracts.easyTrack, "evmScriptExecutor", []);

    const observersBefore = await readObservers(client);
    assert.notInclude(observersBefore, bytes.normalize(vote.opStackTokenRatePusher));
    assert.notInclude(observersBefore, bytes.normalize(vote.stakingRevenueSource));

    const implementationBefore = await client.read(lidoLocator, "proxy__getImplementation", []);
    assert.notEqual(bytes.normalize(implementationBefore), bytes.normalize(vote.lidoLocatorImplementation));

    assert.isFalse(await client.read(stonksStethRegistry, "isRecipientAllowed", [buybackAllocator.address]));

    for (const role of [vote.addRecipientRole, vote.removeRecipientRole]) {
      await checks.accessControl.checkOzRoleNotGranted({
        contracts: asAccessControl(lolStablecoinsRegistry),
        role,
        account: evmScriptExecutor,
      });
    }
    await checkExecutorCannotManageLolRecipients(client, evmScriptExecutor);

    const [proposal] = (await passProposals()).proposalEvents;

    // the Agent runs the forwarded script through CallsScript, which logs every call before making it
    const forwardedCall = (target: Address) =>
      event(governance.callsScript, "LogScriptCall", [governance.adminExecutor.address, agent.address, target], {
        emitter: agent.address,
      });

    proposal.call(0, [
      forwardedCall(tokenRateNotifier.address),
      event(tokenRateNotifier, "ObserverAdded", [vote.opStackTokenRatePusher, vote.observerKindNoArgs]),
      forwardedCall(tokenRateNotifier.address),
      event(tokenRateNotifier, "ObserverAdded", [vote.stakingRevenueSource, vote.observerKindWithArgs]),
      forwardedCall(lidoLocator.address),
      ...ev.proxy.upgraded(lidoLocator, { implementation: vote.lidoLocatorImplementation }),
      forwardedCall(stonksStethRegistry.address),
      event(stonksStethRegistry, "RecipientAdded", [buybackAllocator.address, vote.buybackAllocatorRecipientTitle]),
      forwardedCall(lolStablecoinsRegistry.address),
      ...ev.accessControl.roleGranted(lolStablecoinsRegistry, { role: vote.addRecipientRole, to: evmScriptExecutor }),
      forwardedCall(lolStablecoinsRegistry.address),
      ...ev.accessControl.roleGranted(lolStablecoinsRegistry, {
        role: vote.removeRecipientRole,
        to: evmScriptExecutor,
      }),
      event(agent, "ScriptResult", [governance.callsScript.address, null, "0x", "0x"]),
    ]);

    const observersAfter = await readObservers(client);
    assert.include(observersAfter, bytes.normalize(vote.opStackTokenRatePusher));
    assert.include(observersAfter, bytes.normalize(vote.stakingRevenueSource));
    assert.lengthOf(observersAfter, observersBefore.length + 2);

    const implementationAfter = await client.read(lidoLocator, "proxy__getImplementation", []);
    assert.equal(bytes.normalize(implementationAfter), bytes.normalize(vote.lidoLocatorImplementation));

    assert.isTrue(await client.read(stonksStethRegistry, "isRecipientAllowed", [buybackAllocator.address]));

    for (const role of [vote.addRecipientRole, vote.removeRecipientRole]) {
      await checks.accessControl.checkOzRoleGranted({
        contracts: asAccessControl(lolStablecoinsRegistry),
        role,
        account: evmScriptExecutor,
      });
    }
    await checkExecutorManagesLolRecipients(client, evmScriptExecutor);
  },
});
