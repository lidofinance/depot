import prompt from "../../src/common/prompt";
import { calculateCid, getUrlByCidV1, isCidUploaded } from "../../src/ipfs/utils";
import { getIpfsProvider, instruction } from "../../src/ipfs/ipfs-provider";

export const uploadDescription = async (name: string, description: string, silent: boolean): Promise<string> => {
  const calculatedCid = await calculateCid(description);
  const descriptionUrl = getUrlByCidV1(calculatedCid);

  console.log(`Fetching description from IPFS...`);
  const isUploaded = await isCidUploaded(calculatedCid);
  const ipfsProvider = await getIpfsProvider();

  if (isUploaded) {
    console.log(`The description is already available ${descriptionUrl}.`);
    return descriptionUrl; // continue with prev uploaded
  }

  console.log(`Description is not uploaded to IPFS`);
  console.log(`Uploading the description to IPFS...`);

  if (!ipfsProvider) {
    console.log(
      `You have filled vote's description. In order for it work correctly you need to upload description to IPFS. This can be done in two ways. The first way is automatic - ${instruction}. The second way is manual - upload description to IPFS yourself, CID should be ${calculatedCid}`,
    );
    await prompt.confirmOrAbort(
      `You could upload description later. Do you want to continue without uploading? `,
      silent,
    );
    return descriptionUrl; // continue without uploading
  }

  const cid = await ipfsProvider.uploadStringToIpfs(description, name);
  if (!cid) {
    await prompt.confirmOrAbort(
      `Vote description not uploaded. You could upload description later. Do you want to continue without upload?`,
      silent,
    );
    return descriptionUrl; // continue after failed uploading
  }

  if (cid !== calculatedCid) {
    await prompt.confirmOrAbort(
      `Vote description uploaded with error, cid doesn't match. You could upload description later. Do you want to continue without upload?`,
      silent,
    );
    return descriptionUrl; // continue after failed uploading
  }

  console.log(`Description uploaded to IPFS ${getUrlByCidV1(cid)} !`);
  return descriptionUrl; // continue after success uploading
};
