import Hash from "ipfs-only-hash";

export const calculateCid = async (string: string) => {
  return await Hash.of(string, { cidVersion: 1, rawLeaves: true });
};

export const isCidUploaded = async (cid: string) => {
  try {
    const resp = await fetch(`https://${cid}.ipfs.dweb.link`);
    return resp.status < 300;
  } catch (e) {
    return false;
  }
};
