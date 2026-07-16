import path from "path";
import fs from "fs/promises";

/**
 * Resolves dir relative to the project root
 * @param path - path to create if it is not exist
 */
async function touchDir(dirPath: string): Promise<boolean> {
  const absoluteDirPath = path.resolve(dirPath);
  try {
    await fs.access(absoluteDirPath);
    return true;
  } catch {
    await fs.mkdir(absoluteDirPath, { recursive: true });
    return false;
  }
}

export default { touchDir };
