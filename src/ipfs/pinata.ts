import { getPinata } from "./utils";

export async function uploadToPinata(file: File, token: string) {
  const pinata = getPinata(token);
  console.log("Uploading to Pinata...");
  const res = await pinata.upload.file(file);
  return res.IpfsHash;
}
