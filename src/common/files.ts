import path from 'path'
import fs from 'fs/promises'

/**
 * Resolves dir relative to the project root
 * @param path - path to create if it is not exist
 */
async function touchDir(dirPath: string) {
  const absoluteDirPath = path.resolve(dirPath)
  try {
    await fs.access(absoluteDirPath)
  } catch {
    await fs.mkdir(absoluteDirPath, { recursive: true })
  }
}

export default { touchDir }
