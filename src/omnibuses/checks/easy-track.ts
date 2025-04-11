import { AbiCoder } from 'ethers'

import { AllowedRecipientsRegistry__factory, ERC20__factory } from '../../../typechain-types/factories/interfaces'
import { assert } from '../../common/assert'
import { Address } from '../../common/types'
import providers from '../../providers/providers'

import { CheckContext } from './checks'

const DEFAULT_ENACTOR: Address = '0xEE00eE11EE22ee33eE44ee55ee66Ee77EE88ee99'
const TEST_RECIPIENT = '0x0102030405060708091011121314151617181920'

const checkFactoryExists = async ({ contracts }: CheckContext, factory: Address) => {
  assert.includeMembers(await contracts.easyTrack.getEVMScriptFactories(), [factory])
}

const checkFactoryNotExists = async ({ contracts }: CheckContext, factory: Address) => {
  assert.notIncludeMembers(await contracts.easyTrack.getEVMScriptFactories(), [factory])
}

const checkTopUpFactory = async (
  { contracts, provider }: CheckContext,
  token: Address,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { agent, easyTrack, stETH } = contracts

  const motionsBefore = await easyTrack.getMotions()

  const erc20Token = ERC20__factory.connect(token, provider)

  const agentTokenBalanceBefore = await erc20Token.balanceOf(agent)

  const recipientsRegistry = await AllowedRecipientsRegistry__factory.connect(registry, provider)
  const recipients = await recipientsRegistry.getAllowedRecipients()

  const recipientsTokenBalancesBefore = await Promise.all(
    recipients.map((recipient) => erc20Token.balanceOf(recipient)),
  )

  const transferAmounts: bigint[] = new Array(recipients.length).fill(1n ** 18n)

  const calldata = AbiCoder.defaultAbiCoder().encode(['address[]', 'uint256[]'], [recipients, transferAmounts])

  const { unlock, mine, increaseTime } = providers.cheats(provider)

  const trustedCallerSigner = await unlock(trustedCaller, 10n ** 18n)
  const createTx = await easyTrack.connect(trustedCallerSigner).createMotion(factory, calldata, { gasLimit: 3_000_000 })
  await createTx.wait()

  const motionsAfter = await easyTrack.getMotions()

  assert.equal(motionsAfter.length, motionsBefore.length + 1)

  const newMotion = await motionsAfter[motionsAfter.length - 1]

  await increaseTime(newMotion.duration + 1n)
  await mine()

  const enactor = await unlock(DEFAULT_ENACTOR, 10n ** 18n)
  const enactTx = await easyTrack.connect(enactor).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 })
  await enactTx.wait()

  const agentTokenBalanceAfter = await erc20Token.balanceOf(agent)
  const recipientBalancesAfter = await Promise.all(recipients.map((recipient) => erc20Token.balanceOf(recipient)))

  const epsilon = token === stETH.address ? 2 : 0

  assert.approximately(
    agentTokenBalanceAfter,
    agentTokenBalanceBefore - transferAmounts.reduce((sum, val) => sum + val),
    BigInt(epsilon * transferAmounts.length),
  )

  for (let i = 0; i < recipients.length; ++i) {
    assert.approximately(recipientBalancesAfter[i], recipientsTokenBalancesBefore[i] + transferAmounts[i], epsilon)
  }
}

const checkAddRecipientFactory = async (
  { contracts, provider }: CheckContext,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { easyTrack } = contracts

  const registryContract = AllowedRecipientsRegistry__factory.connect(registry, provider)
  assert.equal(await registryContract.isRecipientAllowed(TEST_RECIPIENT), false)

  const recipientsBefore = await registryContract.getAllowedRecipients()
  const motionsBefore = await easyTrack.getMotions()

  const calldata = AbiCoder.defaultAbiCoder().encode(['address', 'string'], [TEST_RECIPIENT, 'Test Recipient'])

  const { mine, unlock, increaseTime } = providers.cheats(provider)

  const trustedSigner = await unlock(trustedCaller, 10n ** 18n)

  const createTx = await easyTrack.connect(trustedSigner).createMotion(factory, calldata, { gasLimit: 3_000_000 })

  await createTx.wait()

  const motionsAfter = await easyTrack.getMotions()
  assert.equal(motionsAfter.length, motionsBefore.length + 1)

  const newMotion = motionsAfter[motionsAfter.length - 1]

  await increaseTime(newMotion.duration + 1n)
  await mine()

  const enactorSigner = await unlock(DEFAULT_ENACTOR, 10n ** 18n)

  await easyTrack.connect(enactorSigner).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 })

  const recipientsAfter = await registryContract.getAllowedRecipients()

  assert.equal(recipientsAfter.length, recipientsBefore.length + 1)
  assert.equal(await registryContract.isRecipientAllowed(TEST_RECIPIENT), true)
}

const checkRemoveRecipientFactory = async (
  { contracts, provider }: CheckContext,
  factory: Address,
  registry: Address,
  trustedCaller: Address,
) => {
  const { easyTrack } = contracts

  const registryContract = AllowedRecipientsRegistry__factory.connect(registry, provider)

  assert.equal(await registryContract.isRecipientAllowed(TEST_RECIPIENT), true)
  const recipientsBefore = await registryContract.getAllowedRecipients()
  const motionsBefore = await easyTrack.getMotions()
  const calldata = AbiCoder.defaultAbiCoder().encode(['address'], [TEST_RECIPIENT])

  const { mine, unlock, increaseTime, setBalance } = providers.cheats(provider)

  await setBalance(TEST_RECIPIENT, 10n ** 18n)
  const trustedSigner = await unlock(trustedCaller)
  const createTx = await easyTrack.connect(trustedSigner).createMotion(factory, calldata, { gasLimit: 3_000_000 })
  await createTx.wait()
  const motionsAfter = await easyTrack.getMotions()
  assert.equal(motionsAfter.length, motionsBefore.length + 1)
  const newMotion = motionsAfter[motionsAfter.length - 1]
  await increaseTime(newMotion.duration + 1n)
  await mine()
  const enactorSigner = await unlock(TEST_RECIPIENT)
  await setBalance(TEST_RECIPIENT, 10n ** 18n)
  await easyTrack.connect(enactorSigner).enactMotion(newMotion.id, calldata, { gasLimit: 3_000_000 })
  const recipientsAfter = await registryContract.getAllowedRecipients()
  assert.equal(recipientsAfter.length, recipientsBefore.length - 1)
  assert.equal(await registryContract.isRecipientAllowed(TEST_RECIPIENT), false)
}

export default {
  checkFactoryExists,
  checkFactoryNotExists,
  checkAddRecipientFactory,
  checkRemoveRecipientFactory,
  checkTopUpFactory,
}
