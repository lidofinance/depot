import { BigNumberish, ContractTransactionReceipt } from 'ethers'

export const printVoteDeployInfo = async (voteId: BigNumberish, receipt: ContractTransactionReceipt) => {
  const launchBlock = await receipt.getBlock()
  const launchDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(launchBlock.timestamp * 1000),
  )
  console.log(`
Omnibus successfully launched 🎉!
Details:
    Vote ID: ${voteId}
    Block number: ${receipt.blockNumber}
    Launch date: ${launchDate}
`)
}
