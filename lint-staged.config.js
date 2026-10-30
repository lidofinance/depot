export default {
  "*.{js,mjs,ts}": ["eslint --no-warn-ignored"],
  "*.{js,mjs,ts,json,md}": ["prettier --check"],
  "*.sol": ["forge fmt --check"],
};
