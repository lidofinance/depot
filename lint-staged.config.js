export default {
  "*.{js,mjs,ts}": ["eslint --no-warn-ignored --max-warnings 0"],
  "*.{js,mjs,ts,json,md}": ["prettier --check"],
  "*.sol": ["forge fmt --check"],
};
