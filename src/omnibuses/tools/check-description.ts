import { Omnibus } from "../omnibus";
import { NetworkName } from "../../networks";
import { uploadDescription } from "../../task-actions/upload-description";
import prompt from "../../common/prompt";

export async function checkDescription(omnibus: Omnibus<NetworkName>) {
  if (omnibus.descriptionCID) {
    return;
  }
  if (!omnibus.description) {
    console.log("Omnibus description is empty. Skipping...");
    return;
  }

  console.log(`Uploading the omnibus description to IPFS...`);
  try {
    omnibus.descriptionCID = await uploadDescription({ name: omnibus.name }, {} as any, {} as any);
  } catch (e) {
    console.error(`Failed to upload the omnibus description to IPFS: ${e}`);
    const isConfirmed = await prompt.confirm(
      "Do you want to continue without the description? The default description will be used:\n" +
        omnibus.titles.map((title, index) => `${index + 1}. ${title}`).join("\n"),
    );
    if (!isConfirmed) {
      throw new Error("The omnibus launch was canceled");
    }
  }
}
