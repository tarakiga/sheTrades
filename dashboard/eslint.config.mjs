import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * Dashboard-scoped ESLint flat config.
 *
 * The repo root config only wires js + typescript-eslint + prettier, which left
 * the Next/React-specific rules that this app's source references (via
 * `eslint-disable` directives) undefined — every `react-hooks/exhaustive-deps`
 * and `@next/next/no-img-element` directive reported "rule not found". This
 * config registers those plugins so the directives resolve and the rules
 * actually run:
 *  - rules-of-hooks stays an error (a real bug when violated),
 *  - exhaustive-deps and no-img-element are advisory warnings (don't fail CI),
 *  - unused vars/args prefixed with `_` are treated as intentional.
 */
export default [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },
  prettierConfig
];
