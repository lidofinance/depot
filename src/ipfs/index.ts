import { uploadToPinata } from "./pinata";

export async function uploadToIpfs(text: string, fileName: string) {
  const pinataToken = process.env.PINATA_TOKEN;
  if (!pinataToken) {
    throw new Error("PINATA_TOKEN is not set");
  }
  return uploadToPinata(text, fileName, pinataToken);
}
