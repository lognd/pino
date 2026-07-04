import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      // Stub bodies (throw new Error("TODO(impl): ...")) intentionally
      // keep their real parameter names/types for documentation, prefixed
      // with `_` per TS's own noUnusedParameters convention -- mirror
      // that convention here instead of erroring on every stub.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    settings: { react: { version: "detect" } },
  },
  {
    // scripts/prerender.mjs (docs/design/10-seo-and-content.md's
    // build-time sitemap/prerender step) runs under plain Node, not the
    // browser/TS toolchain the rest of the config targets -- give it
    // Node's globals instead of pulling in a whole `globals` package.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
      },
    },
  },
  { ignores: ["dist/**", "dist-ssr/**", "dist-mock/**", "dist-fullstack/**", "node_modules/**"] },
];
