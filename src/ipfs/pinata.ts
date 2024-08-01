import pinataSDK from "@pinata/sdk";
import { Readable } from "stream";

export async function uploadToPinata(text: string, fileName: string, token: string) {
  const pinata = new pinataSDK({ pinataJWTKey: token });
  console.log("Uploading to Pinata...");
  try {
    const descriptionStream = Readable.from([text]);
    const res = await pinata.pinFileToIPFS(descriptionStream, { pinataMetadata: { name: fileName } });
    return res.IpfsHash;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to upload to Pinata: ${error}`);
  }
}
