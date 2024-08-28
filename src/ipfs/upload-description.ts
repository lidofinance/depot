import { Config } from "../common/config";
import { uploadToPinata } from "./pinata";
import * as console from "node:console";

export const uploadDescription = async (
  omnibusName: string,
  omnibusDescription: string,
  config: Config,
): Promise<string | undefined> => {
  if (omnibusDescription === "") {
    console.warn("Omnibus description is empty. Skipping...");
    return;
  }
  if (!config.pinataToken) {
    console.error(
      "Pinata token is missing, upload is impossible. Set PINATA_TOKEN env variable to upload description to IPFS. You can create new one here: https://app.pinata.cloud/developers/api-keys",
    );
    return;
  }
  const fileName = `${omnibusName}_description.md`;
  return await uploadToPinata(omnibusDescription, fileName, config.pinataToken);
};
