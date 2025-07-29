import { encodeAbiParameters, parseAbiParameters } from "viem";

import { Address } from "../../common/types";
import { assert } from "../../common/assert";
import { CheckContext } from "./checks";
import { ERC20_ABI } from "../../../abi/ERC20.abi";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { Contract } from "../../contracts/contracts";
import bytes from "../../common/bytes";

const DEFAULT_ENACTOR: Address = "0xEE00eE11EE22ee33eE44ee55ee66Ee77EE88ee99";
const TEST_RECIPIENT: Address = "0x0102030405060708091011121314151617181920";

const checkFactoriesExists = async ({ contracts: { easyTrack }, client }: CheckContext, factories: Address[]) => {
  const currentFactories = await client.read(easyTrack, "getEVMScriptFactories", []);
  assert.includeMembers(
    currentFactories.map((address) => bytes.normalize(address)) as Address[],
    factories.map((address) => bytes.normalize(address)),
  );
};

const checkFactoriesNotExists = async ({ contracts: { easyTrack }, client }: CheckContext, factories: Address[]) => {
  const currentFactories = await client.read(easyTrack, "getEVMScriptFactories", []);
  assert.notIncludeMembers(
    currentFactories.map((address) => bytes.normalize(address)) as Address[],
    factories.map((address) => bytes.normalize(address)),
  );
};

const checkFactoryExists = async ({ contracts: { easyTrack }, client }: CheckContext, factory: Address) => {
  const factories = await client.read(easyTrack, "getEVMScriptFactories", []);
  assert.includeMembers(factories as Address[], [factory]);
};

const checkFactoryNotExists = async ({ contracts: { easyTrack }, client }: CheckContext, factory: Address) => {
  const factories = (await client.read(easyTrack, "getEVMScriptFactories", [])) as Address[];
  assert.notIncludeMembers(factories, [factory]);
};

const checkTopUpFactory = async (
  { contracts, client }: CheckContext,
  token: Address,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { easyTrack, agent, stETH } = contracts;
  const erc20Token: Contract<typeof ERC20_ABI> = { abi: ERC20_ABI, address: token, label: "ERC20" };
  const recipientsRegistry: Contract<typeof AllowedRecipientsRegistry_ABI> = {
    abi: AllowedRecipientsRegistry_ABI,
    address: registry,
    label: "AllowedRecipientsRegistry",
  };

  const [motionsBefore, agentTokenBalanceBefore, recipients] = await Promise.all([
    client.read(easyTrack, "getMotions", []),
    client.read(erc20Token, "balanceOf", [agent.address]),
    client.read(recipientsRegistry, "getAllowedRecipients", []),
  ]);

  const recipientBalancesBefore = await Promise.all(
    recipients.map((recipient) => client.read(erc20Token, "balanceOf", [recipient])),
  );

  const transferAmounts: bigint[] = new Array(recipients.length).fill(10n ** 18n);

  const calldata = encodeAbiParameters(parseAbiParameters("address[], uint256[]"), [recipients, transferAmounts]);

  await client.impersonate(trustedCaller, 10n ** 18n);
  await client.write(easyTrack, "createMotion", [factory, calldata], { from: trustedCaller });

  const motionsAfter = await client.read(easyTrack, "getMotions", []);

  assert.equal(motionsAfter.length, motionsBefore.length + 1);

  const newMotion = motionsAfter[motionsAfter.length - 1];

  await client.increaseTime(newMotion.duration + 1n);
  await client.impersonate(DEFAULT_ENACTOR, 10n ** 18n);

  const receipt = await client.write(easyTrack, "enactMotion", [newMotion.id, calldata], {
    from: DEFAULT_ENACTOR,
  });

  await client.mine(10);

  const agentTokenBalanceAfter = await client.read(erc20Token, "balanceOf", [agent.address]);
  const recipientBalancesAfter = await Promise.all(
    recipients.map((recipient) => client.read(erc20Token, "balanceOf", [recipient])),
  );

  const epsilon = token === stETH.address ? 2 : 0;

  assert.approximately(
    agentTokenBalanceAfter,
    agentTokenBalanceBefore - transferAmounts.reduce((sum, val) => sum + val),
    BigInt(epsilon * transferAmounts.length),
  );

  for (let i = 0; i < recipients.length; ++i) {
    assert.approximately(recipientBalancesAfter[i], recipientBalancesBefore[i] + transferAmounts[i], epsilon);
  }
};

const checkAddRecipientFactory = async (
  { contracts, client }: CheckContext,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { easyTrack } = contracts;
  const recipientsRegistry: Contract<typeof AllowedRecipientsRegistry_ABI> = {
    abi: AllowedRecipientsRegistry_ABI,
    address: registry,
    label: "AllowedRecipientsRegistry",
  };

  const [isRecipientAllowed, recipientsBefore, motionsBefore] = await Promise.all([
    client.read(recipientsRegistry, "isRecipientAllowed", [TEST_RECIPIENT]),
    client.read(recipientsRegistry, "getAllowedRecipients", []),
    client.read(easyTrack, "getMotions", []),
  ]);

  assert.isFalse(isRecipientAllowed);

  const calldata = encodeAbiParameters(parseAbiParameters("address, string"), [TEST_RECIPIENT, "Test Recipient"]);

  await client.impersonate(trustedCaller, 10n ** 18n);

  await client.write(easyTrack, "createMotion", [factory, calldata], { from: trustedCaller });

  const motionsAfter = await client.read(easyTrack, "getMotions", []);
  assert.equal(motionsAfter.length, motionsBefore.length + 1);

  const newMotion = motionsAfter[motionsAfter.length - 1];

  await client.increaseTime(newMotion.duration + 1n);

  await client.impersonate(DEFAULT_ENACTOR, 10n ** 18n);

  await client.write(easyTrack, "enactMotion", [newMotion.id, calldata], { from: DEFAULT_ENACTOR });

  const recipientsAfter = await client.read(recipientsRegistry, "getAllowedRecipients", []);

  assert.equal(recipientsAfter.length, recipientsBefore.length + 1);
  assert.equal(await client.read(recipientsRegistry, "isRecipientAllowed", [TEST_RECIPIENT]), true);
};

const checkRemoveRecipientFactory = async (
  { contracts, client }: CheckContext,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { easyTrack } = contracts;
  const registryContract: Contract<typeof AllowedRecipientsRegistry_ABI> = {
    address: registry,
    abi: AllowedRecipientsRegistry_ABI,
    label: "AllowedRecipientsRegistry",
  };

  assert.equal(await client.read(registryContract, "isRecipientAllowed", [TEST_RECIPIENT]), true);

  const recipientsBefore = await client.read(registryContract, "getAllowedRecipients", []);
  const motionsBefore = await client.read(easyTrack, "getMotions", []);

  const calldata = encodeAbiParameters(parseAbiParameters("address"), [TEST_RECIPIENT]);

  await client.impersonate(trustedCaller, 10n ** 18n);
  await client.write(easyTrack, "createMotion", [factory, calldata], { from: trustedCaller });

  const motionsAfter = await client.read(easyTrack, "getMotions", []);
  assert.equal(motionsAfter.length, motionsBefore.length + 1);
  const newMotion = motionsAfter[motionsAfter.length - 1];

  await client.increaseTime(newMotion.duration + 1n);

  await client.impersonate(DEFAULT_ENACTOR, 10n ** 18n);

  await client.write(easyTrack, "enactMotion", [newMotion.id, calldata], { from: DEFAULT_ENACTOR });
  const recipientsAfter = await client.read(registryContract, "getAllowedRecipients", []);

  assert.equal(recipientsAfter.length, recipientsBefore.length - 1);
  assert.equal(await client.read(registryContract, "isRecipientAllowed", [TEST_RECIPIENT]), false);
};

export default {
  checkFactoryExists,
  checkFactoriesExists,
  checkFactoryNotExists,
  checkFactoriesNotExists,
  checkAddRecipientFactory,
  checkRemoveRecipientFactory,
  checkTopUpFactory,
};
