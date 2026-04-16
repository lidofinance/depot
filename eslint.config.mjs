import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  // Base TS recommended rules
  ...tseslint.configs.recommended,

  // Prettier — disables formatting rules that conflict
  eslintConfigPrettier,

  // Global settings
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Async safety — critical for blockchain code
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "warn",
      "require-await": "off",
      "@typescript-eslint/require-await": "warn",

      // Type safety
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",

      // Relaxed where pragmatic
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Test files — relaxed rules
  {
    files: ["test/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // Omnibus files — relaxed (generated/templated code)
  {
    files: ["omnibuses/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Ignore patterns
  {
    ignores: [
      "artifacts/",
      "cache/",
      "cache_forge/",
      "out_forge/",
      "archive/",
      "node_modules/",
      "coverage/",
      "lib/",
      "*.config.js",
      "*.config.mjs",
    ],
  },
];
