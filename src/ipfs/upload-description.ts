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
  const file = new File([omnibusDescription], fileName, { type: "text/plain" });
  const cid = await uploadToPinata(file, config.pinataToken);

  const logStr = `https://${cid}.ipfs.w3s.link`;
  console.log(
    `Omnibus description successfully uploaded to IPFS:
┌${"─".repeat(logStr.length + 8)}┐
│  CID: ${cid} ${" ".repeat(logStr.length - cid.length - 1)} │
│ Link: ${logStr} │
└${"─".repeat(logStr.length + 8)}┘`,
  );

  return cid;
};
