import { BigNumberish, formatEther, JsonRpcProvider, TransactionReceipt } from 'ethers'
import { before, describe, it } from 'mocha'

import lido from '../src/lido'
import { StakingModule } from '../src/lido/lido'
import networks from '../src/networks'
import checks from '../src/omnibuses/checks'
import { enactOmnibus } from '../src/omnibuses/tools/test'

import omnibus from './_example_omnibus'

const { stakingRouter, tokens, easyTrack, events } = checks.mainnet

const url = networks.localRpcUrl('eth')
const provider = new JsonRpcProvider(url)
const contracts = lido.eth[omnibus.network](provider)

// Testing values
const expectedTargetShare = 400n
const expectedTreasuryFee = 200n
const expectedStakingModuleFee = 800n
const tokenTransfers = [
  {
    recipient: '0x17F6b2C738a63a8D3A113a228cfd0b373244633D',
    amount: 180_000n * 10n ** 18n,
  },
  {
    recipient: '0x0000000000000000000000000000000000000777',
    amount: 10_000n * 10n ** 18n,
  },
  {
    recipient: '0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956',
    amount: 110_000n * 10n ** 18n,
  },
]
const newNopCount = 7
const newOperators = [
  {
    name: 'A41',
    rewardAddress: '0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7',
  },
  {
    name: 'Develp GmbH',
    rewardAddress: '0x0a6a0b60fFeF196113b3530781df6e747DdC565e',
  },
  {
    name: 'Ebunker',
    rewardAddress: '0x2A2245d1f47430b9f60adCFC63D158021E80A728',
  },
  {
    name: 'Gateway.fm AS',
    rewardAddress: '0x78CEE97C23560279909c0215e084dB293F036774',
  },
  {
    name: 'Numic',
    rewardAddress: '0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC',
  },
  {
    name: 'ParaFi Technologies LLC',
    rewardAddress: '0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7',
  },
  {
    name: 'RockawayX Infra',
    rewardAddress: '0xcA6817DAb36850D58375A10c78703CE49d41D25a',
  },
]
const addFactoryValues = {
  name: 'reWARDS stETH',
  factories: {
    topUp: '0x85d703B2A4BaD713b596c647badac9A1e95bB03d' as `0x${string}`,
    addRecipient: '0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C' as `0x${string}`,
    removeRecipient: '0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E' as `0x${string}`,
  },
  token: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as `0x${string}`, // stETH
  registry: '0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A' as `0x${string}`,
  trustedCaller: '0x87D93d9B2C672bf9c9642d853a8682546a5012B5' as `0x${string}`,
}

const removeFactoryValues = {
  name: 'reWARDS LDO',
  factories: {
    topUp: '0x200dA0b6a9905A377CF8D469664C65dB267009d1' as `0x${string}`,
    addRecipient: '0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252' as `0x${string}`,
    removeRecipient: '0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7' as `0x${string}`,
  },
}

describe('Testing _demo_omnibus', () => {
  let enactReceipt: TransactionReceipt
  let snapshotId: string

  before(async () => {
    snapshotId = await provider.send('evm_snapshot', [])
  })

  after(async () => {
    await provider.send('evm_revert', [snapshotId])
  })

  describe('Check network state before voting...', () => {
    it('Simple DVT module state is as expected', async () => {
      await stakingRouter.checkStakingModule(StakingModule.SimpleDVT, {
        targetShare: 400n,
        treasuryFee: 200n,
        stakingModuleFee: 800n,
      })
    })
  })

  describe('Enact omnibus and check network state after voting...', () => {
    let agentLDOBalanceBefore: bigint
    let balancesBefore: BigNumberish[]
    let nodeOperatorsCountBefore: bigint

    before(async () => {
      agentLDOBalanceBefore = await contracts.ldo.balanceOf(contracts.agent.address)
      balancesBefore = await Promise.all(tokenTransfers.map(({ recipient }) => contracts.ldo.balanceOf(recipient)))
      nodeOperatorsCountBefore = await contracts.curatedStakingModule.getNodeOperatorsCount()

      // Start and enact omnibus. Keep receipt to check events later.
      enactReceipt = await enactOmnibus(omnibus, provider)
      console.log('    Omnibus enacted successfully. Running checks...')
    })

    describe('Check that all assets were transferred correctly', () => {
      for (let i = 0; i < tokenTransfers.length; i++) {
        const { recipient, amount } = tokenTransfers[i]
        it(`${formatEther(amount)} LDO were transferred to ${recipient}`, async () => {
          const expectedBalance = BigInt(balancesBefore[i]) + BigInt(amount)

          await tokens.checkLDOBalance(recipient, expectedBalance)
        })
      }

      it('LDO budget was decreased by the total amount of transfers', async () => {
        const totalSum = tokenTransfers.reduce((acc, { amount }) => acc + amount, 0n)

        await tokens.checkLDOBalance(contracts.agent.address, agentLDOBalanceBefore - totalSum)
      })
    })

    describe('Check staking module update...', () => {
      it(`Simple DVT module was correctly updated`, async () => {
        await stakingRouter.checkStakingModule(StakingModule.SimpleDVT, {
          targetShare: expectedTargetShare,
          treasuryFee: expectedTreasuryFee,
          stakingModuleFee: expectedStakingModuleFee,
        })
      })
    })

    describe('Check adding new node operators...', () => {
      it(`node operators count was increased by ${newNopCount}`, async () => {
        const expectedNodeOperatorsCount = nodeOperatorsCountBefore + BigInt(newNopCount)

        await stakingRouter.checkNodeOperatorsCount(expectedNodeOperatorsCount)
      })

      for (let i = 0; i < newOperators.length; i++) {
        const operator = newOperators[i]
        it(`operator ${operator.name} was successfully added`, async () => {
          const operatorIndex = nodeOperatorsCountBefore + BigInt(i)

          await stakingRouter.checkNodeOperator(operatorIndex, operator.name, operator.rewardAddress as `0x${string}`)
        })
      }
    })

    describe('Check easy track changes...', () => {
      it(`New top up factory ${addFactoryValues.name} can make payments`, async () => {
        await easyTrack.checkFactoryExists(addFactoryValues.factories.topUp)
        await easyTrack.checkTopUpFactory(
          addFactoryValues.token,
          addFactoryValues.factories.topUp,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        )
      })

      it(`New add recipient factory ${addFactoryValues.name} works as expected`, async () => {
        await easyTrack.checkFactoryExists(addFactoryValues.factories.addRecipient)
        await easyTrack.checkAddRecipientFactory(
          addFactoryValues.factories.addRecipient,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        )
      })

      it(`New remove recipient factory ${addFactoryValues.name} works as expected`, async () => {
        await easyTrack.checkFactoryExists(addFactoryValues.factories.removeRecipient)
        await easyTrack.checkRemoveRecipientFactory(
          addFactoryValues.factories.removeRecipient,
          addFactoryValues.registry,
          addFactoryValues.trustedCaller,
        )
      })

      it(`Top Up factory ${removeFactoryValues.factories.topUp} was removed`, async () => {
        await easyTrack.checkFactoryNotExists(removeFactoryValues.factories.topUp)
      })

      it(`Add recipient factory ${removeFactoryValues.factories.addRecipient} was removed`, async () => {
        await easyTrack.checkFactoryNotExists(removeFactoryValues.factories.addRecipient)
      })

      it(`Remove recipient factory ${removeFactoryValues.factories.removeRecipient} was removed`, async () => {
        await easyTrack.checkFactoryNotExists(removeFactoryValues.factories.removeRecipient)
      })
    })
  })

  describe('Check fired events by action...', () => {
    it('All expected events were fired', () => {
      events.checkOmnibusEvents(omnibus.items, enactReceipt)
    })
  })
})
