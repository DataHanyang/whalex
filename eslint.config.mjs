// Flat ESLint config for the whole monorepo. Kept deliberately lean: the
// recommended TS rules plus react-hooks for the renderer — a safety net for
// real mistakes, not a style debate. Formatting stays with the editor.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/release/**",
      "apps/desktop/resources/**",
      "docs/**",
      "scripts/ps/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The agent toolchain passes untyped JSON around by design.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `catch {}` with a comment is an accepted pattern in this codebase.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `const self = this` for closures handed to plain-object tool defs.
      "@typescript-eslint/no-this-alias": ["error", { allowedNames: ["self", "registry"] }],
    },
  },
  {
    files: ["apps/desktop/src/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The compiler-era rules flag long-established patterns in this
      // codebase (draft hand-off effects, ref-mirror for stable listeners).
      // Keep the classic safety rules, skip the refactor mandates.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Automation scripts: they mix Node and page.evaluate() browser contexts
    // in one file, and the .cjs ones run inside Electron via require().
    files: ["scripts/**", "packages/*/scripts/**", "**/*.cjs"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.{mjs,cjs,js}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
  },
);
