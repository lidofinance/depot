import path from "path";
import { Omnibus } from "../omnibuses/omnibus";
import { NetworkName } from "../networks";
import { ActionType } from "hardhat/types";
import { uploadToIpfs } from "../ipfs";

export const uploadDescription: ActionType<{ name: string }> = async ({ name }) => {
  const omnibusPath = path.join(process.env.PWD!, `omnibuses/${name}.ts`);
  const omnibus: Omnibus<NetworkName> = require(omnibusPath).default;

  if (omnibus.isExecuted) {
    console.log(`Omnibus already was executed. Aborting...`);
    return;
  }

  if (omnibus.description === "") {
    console.log("Omnibus description is empty. Skipping...");
    return;
  }

  const fileName = `${name}_description.md`;
  const cid = await uploadToIpfs(omnibus.description, fileName);
  console.log(
    `Omnibus description successfully uploaded to IPFS with CID:
    ┌${"─".repeat(cid.length + 2)}┐
    │ ${cid} │
    └${"─".repeat(cid.length + 2)}┘
Don\'t forget to update the omnibus with the new description CID.`,
  );
  return cid;
};
