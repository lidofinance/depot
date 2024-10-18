import { getCIDFromFile, getIPFSFileByCID } from "../../ipfs/utils";
import prompt from "../../common/prompt";
import { uploadDescription } from "../../ipfs/upload-description";
import { getConfigFromEnv } from "../../common/config";
import { Omnibus } from "../omnibuses";

const VOTE_CID_PREFIX = "lidovoteipfs://";

export const getDescription = async (
  omnibusName: string,
  omnibus: Omnibus,
  cid: string | undefined,
): Promise<[string, boolean]> => {
  if (!cid) {
    try {
      cid = await getCIDFromFile(omnibusName);
    } catch (e) {
      const confirm = await prompt.confirm("CID was not found in file. Do you want to upload a new one?");
      if (confirm) {
        cid = await uploadDescription(omnibusName, omnibus.description, getConfigFromEnv());
      }
    }
  }

  if (cid) {
    try {
      console.log(`Fetching description from IPFS...`);
      const desc = await getIPFSFileByCID(cid);
      const answer = await prompt.select(
        `Check description from IPFS ${cid}:\n${"-".repeat(10)}\n${desc}\n${"-".repeat(10)}\nWhat do you want to do?`,
        [
          { title: "Use this CID", value: "use" },
          { title: "Upload new description from omnibus", value: "upload" },
          { title: "Use omnibus summary as a description", value: "summary" },
          { title: "Exit and solve it manually", value: "abort" },
        ],
      );
      if (answer === "use") {
        console.log(`Using the CID: ${cid}`);
      } else if (answer === "upload") {
        console.log(`Uploading the description to IPFS`);
        cid = await uploadDescription(omnibusName, omnibus.description, getConfigFromEnv());
      } else if (answer === "summary") {
        console.log(`Using the the omnibus summary as a description`);
        cid = "";
      } else {
        return ["", true];
      }
    } catch (e: any) {
      console.error(`Error fetching description from IPFS: ${e.message}`);
      const answer = await prompt.select(`Can't get description from IPFS. What do you want to do?`, [
        { title: "Use this CID anyway", value: "use" },
        { title: "Use omnibus summary as a description", value: "summary" },
        { title: "Exit and solve it manually", value: "abort" },
      ]);
      if (answer === "use") {
        console.log(`Using the CID: ${cid}`);
      } else if (answer === "summary") {
        console.log(`Using the the omnibus summary as a description`);
        cid = "";
      } else {
        return ["", true];
      }
    }
  }

  const omnibusDescription = cid ? `${omnibus.summary}\n${VOTE_CID_PREFIX}${cid}` : omnibus.summary;
  const confirm = await prompt.confirm("Omnibus description:\n\n" + omnibusDescription + "\n\nDo you want to proceed?");
  if (!confirm) {
    return ["", true];
  }
  return [omnibusDescription, false];
};
