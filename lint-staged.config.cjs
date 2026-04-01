const { ESLint } = require('eslint')

const removeIgnoredFiles = async (files) => {
  const eslint = new ESLint()
  const ignoredFiles = await Promise.all(files.map((file) => eslint.isPathIgnored(file)))
  // eslint show warning on ignored files https://stackoverflow.com/questions/37927772/how-to-silence-warnings-about-ignored-files-in-eslint
  const filteredFiles = files.filter((_, i) => !ignoredFiles[i])
  return `"${filteredFiles.join('" "')}"`
}

module.exports = {
  '*.{js,ts}': async (files) => {
    const filesToLint = await removeIgnoredFiles(files)
    return [`eslint --max-warnings=0 ${filesToLint}`]
  },
  './**/*.{js,ts,cjs, mjs,css,md,json}': ['prettier --write'],
}
