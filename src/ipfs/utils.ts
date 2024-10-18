import { PinataSDK } from "pinata";
import fs from "node:fs/promises";
import path from "node:path";

export function getPinata(token: string) {
  return new PinataSDK({ pinataJwt: token });
}

export const getIPFSFileByCID = async (cid: string): Promise<string> => {
  const res = await fetch(`https://${cid}.ipfs.w3s.link`);
  const data = await res.text();
  if (!data) {
    throw new Error(`No data found by CID ${cid}`);
  }
  return data;
};

export const getCIDFromFile = async (omnibusName: string) => {
  const cidFilePath = getCIDFilePath(omnibusName);
  const cid = await fs.readFile(cidFilePath, "utf-8");
  console.log(`CID was found in the file ${cidFilePath}: [${cid}]`);
  return cid;
};

export const getCIDFilePath = (omnibusName: string) =>
  path.join(process.cwd(), "omnibuses", `${omnibusName}_description_cid.txt`);

export const saveCID = async (omnibusName: string, cid: string) => {
  const cidFilePath = getCIDFilePath(omnibusName);
  await fs.writeFile(cidFilePath, cid);
  console.log(`CID was saved to the file: ${cidFilePath}`);
};
