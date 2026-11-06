import { PinataSDK } from "pinata-web3";
import * as env from "../common/env";

/** The uploaded CID, `""` on a failed upload, `null` without `PINATA_JWT` */
export async function uploadToPinata(content: string, name: string): Promise<string | null> {
  const pinataJwt = env.PINATA_JWT();
  if (!pinataJwt) {
    return null;
  }
  try {
    const pinata = new PinataSDK({ pinataJwt });
    const file = new File([content], `${name}.md`, { type: "text/markdown" });
    const { IpfsHash } = await pinata.upload.file(file, { cidVersion: 1 });
    return IpfsHash;
  } catch (error) {
    console.error(error);
    return "";
  }
}
