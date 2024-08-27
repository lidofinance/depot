import { getPinata } from "./utils";

export async function uploadToPinata(text: string, fileName: string, token: string) {
  const pinata = getPinata(token);
  console.log("Uploading to Pinata...");
  try {
    const file = new File([text], fileName, { type: "text/markdown" });
    const res = await pinata.upload.file(file);
    return res.IpfsHash;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to upload to Pinata: ${error}`);
  }
}
