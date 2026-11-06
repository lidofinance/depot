import prompt from "../../src/common/prompt";
import { calculateCid, getUrlByCidV1, isCidUploaded } from "../../src/ipfs/utils";
import { uploadToPinata } from "../../src/ipfs/pinata";

export const uploadDescription = async (name: string, description: string, silent: boolean): Promise<string> => {
  const calculatedCid = await calculateCid(description);
  const descriptionUrl = getUrlByCidV1(calculatedCid);

  console.log(`Fetching description from IPFS...`);
  const isUploaded = await isCidUploaded(calculatedCid);

  if (isUploaded) {
    console.log(`The description is already available ${descriptionUrl}.`);
    return descriptionUrl;
  }

  console.log(`Description is not uploaded to IPFS`);
  console.log(`Uploading the description to IPFS...`);

  const cid = await uploadToPinata(description, name);
  if (cid === null) {
    console.log(
      `You have filled vote's description. In order for it work correctly you need to upload description to IPFS. This can be done in two ways. The first way is automatic - you need to add env variable PINATA_JWT, you could get JWT it at https://pinata.cloud site for free. The second way is manual - upload description to IPFS yourself, CID should be ${calculatedCid}`,
    );
    await prompt.confirmOrAbort(
      `You could upload description later. Do you want to continue without uploading? `,
      silent,
    );
    return descriptionUrl;
  }

  if (!cid) {
    await prompt.confirmOrAbort(
      `Vote description not uploaded. You could upload description later. Do you want to continue without upload?`,
      silent,
    );
    return descriptionUrl;
  }

  if (cid !== calculatedCid) {
    await prompt.confirmOrAbort(
      `Vote description uploaded with error, cid doesn't match. You could upload description later. Do you want to continue without upload?`,
      silent,
    );
    return descriptionUrl;
  }

  console.log(`Description uploaded to IPFS ${getUrlByCidV1(cid)} !`);
  return descriptionUrl;
};
