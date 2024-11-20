import { Omnibus } from "../omnibuses";
import prompt from "../../common/prompt";
import { calculateCid, isCidUploaded } from "../../ipfs/utils";
import { getIpfsProvider, instruction } from "../../ipfs/ipfs-provider";

const VOTE_CID_PREFIX = "lidovoteipfs://";

export const uploadDescription = async (omnibusName: string, omnibus: Omnibus): Promise<[string, boolean]> => {
  const description = omnibus.description.trim();
  if (!description) {
    const confirm = await prompt.confirm(
      `You have not filled the omnibus description field, it means that users only have a basic description of the items. Do you want to continue?`,
    );
    return [omnibus.summary, !confirm]; // continue or not without description
  }

  const calculatedCid = await calculateCid(description);
  const omnibusDescription = `${omnibus.summary}\n${VOTE_CID_PREFIX}${calculatedCid}`;

  console.log(`Fetching description from IPFS...`);
  const isUploaded = await isCidUploaded(calculatedCid);
  const ipfsProvider = await getIpfsProvider();

  if (isUploaded) {
    console.log(`The description is already available https://${calculatedCid}.ipfs.dweb.link .`);
    return [omnibusDescription, false]; // continue with prev uploaded
  }

  console.log(`Description is not uploaded to IPFS`);
  console.log(`Uploading the description to IPFS...`);

  if (!ipfsProvider) {
    console.log(
      `You have filled vote's description. In order for it work correctly you need to upload it to IPFS. This can be done in two ways. The first way is automatic - ${instruction}. The second way is manual - upload description to IPFS yourself, CID should be ${calculatedCid}`,
    );
    const confirm = await prompt.confirm(`You could upload description later. Do you want to continue without upload?`);
    return [omnibusDescription, !confirm]; // continue or not without uploading
  }

  const cid = await ipfsProvider.uploadStringToIpfs(description, omnibusName);
  if (!cid) {
    const confirm = await prompt.confirm(
      `Vote description not uploaded. You could upload description later. Do you want to continue without upload?`,
    );
    return [omnibusDescription, !confirm]; // continue or not without uploading
  }

  if (cid !== calculatedCid) {
    const confirm = await prompt.confirm(
      `Vote description uploaded with error, cid doesn't match. You could upload description later. Do you want to continue without upload?`,
    );
    return [omnibusDescription, !confirm]; // continue or not without uploading
  }

  console.log(`Description uploaded to IPFS https://${calculatedCid}.ipfs.dweb.link !`);
  return [omnibusDescription, false]; // continue after success uploading
};
