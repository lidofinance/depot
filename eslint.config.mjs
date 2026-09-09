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
      "@typescript-eslint/no-misused-promises": "error",
      "require-await": "off",
      "@typescript-eslint/require-await": "error",

      // Type safety
      "@typescript-eslint/no-unsafe-argument": "warn",

      // Relaxed where pragmatic
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // Test files — relaxed rules
  {
    files: ["test/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },

  // Omnibus files — relaxed (generated/templated code, params destructured for reference)
  {
    files: ["omnibuses/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Ignore patterns
  {
    ignores: [
      "artifacts/",
      "cache/",
      "cache_forge/",
      "out_forge/",
      "node_modules/",
      "coverage/",
      "lib/",
      "*.config.js",
      "*.config.mjs",
      "mount/",
      "scripts/",
    ],
  },
];
