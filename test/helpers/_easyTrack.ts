import { assert } from "../../src/common/assert";
import { ZeroAddress, AbiCoder, JsonRpcProvider } from "ethers";

import lido from "../../src/lido";
import {
  AddAllowedRecipient__factory,
  AllowedRecipientsRegistry__factory,
  ERC20__factory,
} from "../../typechain-types";
import { LocalProvider, StaticProvider } from "../../src/providers";

const DEFAULT_ENACTOR: Address = "0xEE00eE11EE22ee33eE44ee55ee66Ee77EE88ee99";

interface AddRecipientMotionParams {
  factory: Address;
  recipient: Address;
  trustedCaller: Address;
  title: String;
}

type Provider = LocalProvider<StaticProvider<JsonRpcProvider>>;

export async function createAndEnactAddRecipientMotion<T extends Provider>(
  provider: T,
  motionParams: AddRecipientMotionParams,
  enactor = DEFAULT_ENACTOR,
) {
  const { contracts } = lido.v2(provider);
  const factory = AddAllowedRecipient__factory.connect(motionParams.factory, provider);
  const registry = AllowedRecipientsRegistry__factory.connect(
    await factory.allowedRecipientsRegistry(),
    provider,
  );
  assert.isFalse(await registry.isRecipientAllowed(motionParams.recipient));

  const recipientsBefore = await registry.getAllowedRecipients();
  const motionsBefore = await contracts.easyTrack.getMotions();

  const calldata = AbiCoder.defaultAbiCoder().encode(
    ["address", "string"],
    [motionParams.recipient, motionParams.title],
  );

  await provider.setBalance(motionParams.recipient, 10n ** 18n);
  const trustedSigner = await provider.unlock(motionParams.trustedCaller);

  const createTx = await contracts.easyTrack
    .connect(trustedSigner)
    .createMotion(motionParams.factory, calldata, { gasLimit: 3_000_000 });

  await createTx.wait();

  const motionsAfter = await contracts.easyTrack.getMotions();
  assert.equal(motionsAfter.length, motionsBefore.length + 1);

  const newMotion = motionsAfter[motionsAfter.length - 1];

  await provider.increaseTime(newMotion.duration + 1n);
  await provider.mine();

  const enactorSigner = await provider.unlock(enactor);
  await provider.setBalance(enactor, 10n ** 18n);

  await contracts.easyTrack
    .connect(enactorSigner)
    .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });

  const recipientsAfter = await registry.getAllowedRecipients();

  assert.equal(recipientsAfter.length, recipientsBefore.length + 1);
  assert.isTrue(await registry.isRecipientAllowed(motionParams.recipient));
}

interface PaymentMotionParams {
  trustedCaller: Address;
  factory: Address;
  token: Address;
  recipients: Address[];
  transferAmounts: bigint[];
}

export async function createAndEnactPaymentMotion<T extends Provider>(
  provider: T,
  motionParams: PaymentMotionParams,
  enactor: Address = DEFAULT_ENACTOR,
) {
  const { addresses, contracts } = lido.v2(provider);

  const motionsBefore = await contracts.easyTrack.getMotions();
  const agentBalanceBefore = await balanceOf(provider, motionParams.token, addresses.agent);
  const recipientBalancesBefore = await Promise.all(
    motionParams.recipients.map((recipient) => balanceOf(provider, motionParams.token, recipient)),
  );

  const calldata = AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]"],
    [motionParams.recipients, motionParams.transferAmounts],
  );

  const trustedCallerSigner = await provider.unlock(motionParams.trustedCaller);
  const createTx = await contracts.easyTrack
    .connect(trustedCallerSigner)
    .createMotion(motionParams.factory, calldata, { gasLimit: 3_000_000 });
  await createTx.wait();

  const motionsAfter = await contracts.easyTrack.getMotions();

  assert.equal(motionsAfter.length, motionsBefore.length + 1);

  const newMotion = await motionsAfter[motionsAfter.length - 1];

  await provider.increaseTime(newMotion.duration + 1n);
  await provider.mine();

  const enactorSigner = await provider.unlock(enactor);
  await provider.setBalance(enactor, 10n ** 18n);
  const enactTx = await contracts.easyTrack
    .connect(enactorSigner)
    .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });
  await enactTx.wait();

  const agentBalanceAfter = await balanceOf(provider, motionParams.token, addresses.agent);
  const recipientBalancesAfter = await Promise.all(
    motionParams.recipients.map((recipient) => balanceOf(provider, motionParams.token, recipient)),
  );

  const epsilon = motionParams.token === addresses.lido ? 2 : 0;

  assert.approximately(
    agentBalanceAfter,
    agentBalanceBefore - motionParams.transferAmounts.reduce((sum, val) => sum + val),
    epsilon * motionParams.transferAmounts.length,
  );

  for (let i = 0; i < motionParams.recipients.length; ++i) {
    assert.approximately(
      recipientBalancesAfter[i],
      recipientBalancesBefore[i] + motionParams.transferAmounts[i],
      epsilon,
    );
  }
}

interface RemoveRecipientMotionParams {
  factory: Address;
  recipient: Address;
  trustedCaller: Address;
}

export async function createAndEnactRemoveRecipientMotion<T extends Provider>(
  provider: T,
  motionParams: RemoveRecipientMotionParams,
  enactor = DEFAULT_ENACTOR,
) {
  const { contracts } = lido.v2(provider);
  const factory = AddAllowedRecipient__factory.connect(motionParams.factory, provider);
  const registry = AllowedRecipientsRegistry__factory.connect(
    await factory.allowedRecipientsRegistry(),
    provider,
  );
  assert.isTrue(await registry.isRecipientAllowed(motionParams.recipient));

  const recipientsBefore = await registry.getAllowedRecipients();
  const motionsBefore = await contracts.easyTrack.getMotions();

  const calldata = AbiCoder.defaultAbiCoder().encode(["address"], [motionParams.recipient]);

  await provider.setBalance(motionParams.recipient, 10n ** 18n);
  const trustedSigner = await provider.unlock(motionParams.trustedCaller);

  const createTx = await contracts.easyTrack
    .connect(trustedSigner)
    .createMotion(motionParams.factory, calldata, { gasLimit: 3_000_000 });

  await createTx.wait();

  const motionsAfter = await contracts.easyTrack.getMotions();
  assert.equal(motionsAfter.length, motionsBefore.length + 1);

  const newMotion = motionsAfter[motionsAfter.length - 1];

  await provider.increaseTime(newMotion.duration + 1n);
  await provider.mine();

  const enactorSigner = await provider.unlock(enactor);
  await provider.setBalance(enactor, 10n ** 18n);

  await contracts.easyTrack
    .connect(enactorSigner)
    .enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 });

  const recipientsAfter = await registry.getAllowedRecipients();

  assert.equal(recipientsAfter.length, recipientsBefore.length - 1);
  assert.isFalse(await registry.isRecipientAllowed(motionParams.recipient));
}

function balanceOf(provider: Provider, token: Address, holder: Address): Promise<bigint> {
  if (token === ZeroAddress) {
    return provider.getBalance(holder);
  }
  return ERC20__factory.connect(token, provider).balanceOf(holder);
}
