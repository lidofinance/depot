import { Address } from 'web3-types'

import { Lido } from '../../../configs/types'
import { AllowedRecipientsRegistry__factory } from '../../../typechain-types'
import { call, event } from '../../aragon-votes-tools'
import bytes, { HexStrPrefixed } from '../../common/bytes'
import { Contracts } from '../../contracts/contracts'
import { OmnibusItem } from '../omnibuses'

const iAllowedRecipientsRegistry = AllowedRecipientsRegistry__factory.createInterface()

interface CommonManageEvmScriptFactoryInput {
  title: string
  factory: Address
}

interface AddEvmScriptFactoryInput extends CommonManageEvmScriptFactoryInput {
  permission: HexStrPrefixed
}

interface RemovePaymentEvmScriptFactoryInput {
  title: string
  factory: Address
}

function removeEvmScriptFactory(
  contracts: Contracts<Lido>,
  { factory, title }: RemovePaymentEvmScriptFactoryInput,
): OmnibusItem {
  const { easyTrack, callsScript, voting } = contracts
  return {
    title: title,
    evmCall: call(easyTrack.removeEVMScriptFactory, [factory]),
    expectedEvents: [
      event(callsScript, 'LogScriptCall', { emitter: voting }),
      event(easyTrack, 'EVMScriptFactoryRemoved', { args: [factory] }),
    ],
  }
}

function addEvmScriptFactory(contracts: Contracts<Lido>, input: AddEvmScriptFactoryInput): OmnibusItem {
  const { easyTrack, callsScript, voting } = contracts
  return {
    title: input.title,
    evmCall: call(easyTrack.addEVMScriptFactory, [input.factory, input.permission]),
    expectedEvents: [
      event(callsScript, 'LogScriptCall', { emitter: voting }),
      event(easyTrack, 'EVMScriptFactoryAdded', {
        args: [input.factory, input.permission],
      }),
    ],
  }
}

interface AddNamedEvmScriptFactoryInput {
  name: string
  factory: Address
  registry: Address
}

function addTopUpEvmScriptFactory(contracts: Contracts<Lido>, input: AddNamedEvmScriptFactoryInput): OmnibusItem {
  const { finance } = contracts
  return addEvmScriptFactory(contracts, {
    title: `Add top up EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call finance.newImmediatePayment()
      ...[finance.address, finance.newImmediatePayment.fragment.selector],
      // allow to call allowedRecipientsRegistry.updateSpentAmount()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction('updateSpentAmount').selector],
    ),
  })
}

function addAddRecipientEvmScriptFactory(
  contracts: Contracts<Lido>,
  input: AddNamedEvmScriptFactoryInput,
): OmnibusItem {
  return addEvmScriptFactory(contracts, {
    title: `Add add recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.addRecipient()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction('addRecipient').selector],
    ),
  })
}

function addRemoveRecipientEvmScriptFactory(
  contracts: Contracts<Lido>,
  input: AddNamedEvmScriptFactoryInput,
): OmnibusItem {
  return addEvmScriptFactory(contracts, {
    title: `Add remove recipient EVM Script Factory "${input.name}"`,
    factory: input.factory,
    permission: bytes.join(
      // allow to call allowedRecipientsRegistry.removeRecipient()
      ...[input.registry, iAllowedRecipientsRegistry.getFunction('removeRecipient').selector],
    ),
  })
}

interface AddPaymentEvmScriptFactoriesInput {
  name: string
  registry: Address
  factories: {
    topUp: Address
    addRecipient?: Address
    removeRecipient?: Address
  }
}

function addPaymentEvmScriptFactories(
  contracts: Contracts<Lido>,
  input: AddPaymentEvmScriptFactoriesInput,
): OmnibusItem[] {
  const commonInput = { name: input.name, registry: input.registry }
  const res: OmnibusItem[] = [addTopUpEvmScriptFactory(contracts, { ...commonInput, factory: input.factories.topUp })]
  if (input.factories.addRecipient) {
    res.push(addAddRecipientEvmScriptFactory(contracts, { ...commonInput, factory: input.factories.addRecipient }))
  }
  if (input.factories.removeRecipient) {
    res.push(
      addRemoveRecipientEvmScriptFactory(contracts, { ...commonInput, factory: input.factories.removeRecipient }),
    )
  }
  return res
}

interface RemovePaymentEvmScriptFactoriesInput {
  name: string
  factories: {
    topUp: Address
    addRecipient?: Address
    removeRecipient?: Address
  }
}

function removePaymentEvmScriptFactories(
  contracts: Contracts<Lido>,
  input: RemovePaymentEvmScriptFactoriesInput,
): OmnibusItem[] {
  const res: OmnibusItem[] = [
    removeEvmScriptFactory(contracts, {
      title: `Remove Top Up EVM Script Factory "${input.factories.topUp}"`,
      factory: input.factories.topUp,
    }),
  ]
  if (input.factories.addRecipient) {
    res.push(
      removeEvmScriptFactory(contracts, {
        title: `Remove Add Recipient EVM Script Factory "${input.factories.addRecipient}"`,
        factory: input.factories.addRecipient,
      }),
    )
  }
  if (input.factories.removeRecipient) {
    res.push(
      removeEvmScriptFactory(contracts, {
        title: `Remove Remove Recipient EVM Script Factory "${input.factories.addRecipient}"`,
        factory: input.factories.removeRecipient,
      }),
    )
  }
  return res
}

export default {
  addEvmScriptFactory,
  addTopUpEvmScriptFactory,
  addAddRecipientEvmScriptFactory,
  addRemoveRecipientEvmScriptFactory,
  addPaymentEvmScriptFactories,
  removeEvmScriptFactory,
  removePaymentEvmScriptFactories,
}
