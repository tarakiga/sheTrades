import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", ".trae/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore is the convention for "this parameter exists to
      // satisfy a signature and is deliberately unused" - Express error
      // handlers' `next`, a provider interface's unused config, a destructured
      // field being skipped. Flagging those makes the rule noise, and noise is
      // how the real unused imports beneath it went unnoticed for weeks.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_"
        }
      ]
    }
  },
  prettierConfig
];
