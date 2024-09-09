import { PinataSDK } from "pinata";

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
