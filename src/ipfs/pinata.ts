import { PinataSDK } from "pinata-web3";
import * as env from "../common/env";

const getProvider = () => {
  const pinata = new PinataSDK({
    pinataJwt: env.PINATA_JWT(),
  });

  const uploadStringToIpfs = async (string: string, name?: string) => {
    try {
      const file = new File([string], `${name}.md`, { type: "text/markdown" });

      const { IpfsHash } = await pinata.upload.file(file, { cidVersion: 1 });
      return IpfsHash;
    } catch (err) {
      console.error(err);
      return "";
    }
  };

  return {
    uploadStringToIpfs,
  };
};

export default {
  getProvider,
};
