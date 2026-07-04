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
  { ignores: ["dist/**", "node_modules/**"] },
];
