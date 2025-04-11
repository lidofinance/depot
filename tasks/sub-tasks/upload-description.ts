import prompt from '../../src/common/prompt'
import { getIpfsProvider, instruction } from '../../src/ipfs/ipfs-provider'
import { calculateCid, getUrlByCidV1, isCidUploaded } from '../../src/ipfs/utils'
import { Omnibus } from '../../src/omnibuses/omnibuses'

const VOTE_CID_PREFIX = 'lidovoteipfs://' //just template for parsing, not a real protocol

export const uploadDescription = async (omnibusName: string, omnibus: Omnibus, silent: boolean): Promise<string> => {
  const description = omnibus.description.trim()
  if (!description && !silent) {
    await prompt.confirmOrAbort(
      `You have not filled the omnibus description field, it means that users only have a basic description of the items. Do you want to continue?`,
      silent,
    )
    return omnibus.summary // continue without description
  }

  const calculatedCid = await calculateCid(description)
  const omnibusDescription = `${omnibus.summary}\n${VOTE_CID_PREFIX}${calculatedCid}`

  console.log(`Fetching description from IPFS...`)
  const isUploaded = await isCidUploaded(calculatedCid)
  const ipfsProvider = await getIpfsProvider()

  if (isUploaded) {
    console.log(`The description is already available ${getUrlByCidV1(calculatedCid)} .`)
    return omnibusDescription // continue with prev uploaded
  }

  console.log(`Description is not uploaded to IPFS`)
  console.log(`Uploading the description to IPFS...`)

  if (!ipfsProvider) {
    console.log(
      `You have filled vote's description. In order for it work correctly you need to upload description to IPFS. This can be done in two ways. The first way is automatic - ${instruction}. The second way is manual - upload description to IPFS yourself, CID should be ${calculatedCid}`,
    )
    await prompt.confirmOrAbort(
      `You could upload description later. Do you want to continue without uploading? `,
      silent,
    )
    return omnibusDescription // continue without uploading
  }

  const cid = await ipfsProvider.uploadStringToIpfs(description, omnibusName)
  if (!cid) {
    await prompt.confirmOrAbort(
      `Vote description not uploaded. You could upload description later. Do you want to continue without upload?`,
      silent,
    )
    return omnibusDescription // continue after failed uploading
  }

  if (cid !== calculatedCid) {
    await prompt.confirmOrAbort(
      `Vote description uploaded with error, cid doesn't match. You could upload description later. Do you want to continue without upload?`,
      silent,
    )
    return omnibusDescription // continue after failed uploading
  }

  console.log(`Description uploaded to IPFS ${getUrlByCidV1(cid)} !`)
  return omnibusDescription // continue after success uploading
}
