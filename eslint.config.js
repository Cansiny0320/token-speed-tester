// @ts-check
import antfu from "@antfu/eslint-config";

export default antfu(
  {
    type: "app",
    pnpm: true,
    ignores: [
      ".github/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "scripts/**",
    ],
    stylistic: {
      indent: 2,
      quotes: "double",
      semi: true,
    },
  },
  {
    rules: {
      // CLI project: allow console and process.exit
      "no-console": "off",
      "node/no-process-exit": "off",
      "node/prefer-global/process": "off",

      // Keep existing code style; avoid large refactors
      "antfu/if-newline": "off",
      "prefer-template": "off",

      // Keep existing import patterns

      // Reduce opinionated unicorn rules
      "unicorn/no-new-array": "off",

      // Avoid JSON/YAML ordering constraints
      "jsonc/sort-keys": "off",
      "jsonc/sort-array-values": "off",
      "yaml/quotes": "off",

      // Tests: don't enforce title casing
      "test/prefer-lowercase-title": "off",
    },
  },
);
