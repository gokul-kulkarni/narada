import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Core runs in every client (desktop web view, Orca's Node worker, future ones), so it may not
// reach for a platform: no Tauri, React or browser-only globals. Clients pass those in as ports.
const PLATFORM_IMPORTS = ["@tauri-apps/*", "react", "react-dom", "zustand"];
const BROWSER_ONLY_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "Worker"];

export default tseslint.config(
  { ignores: ["coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-imports": ["error", { patterns: PLATFORM_IMPORTS }],
      "no-restricted-globals": ["error", ...BROWSER_ONLY_GLOBALS],
    },
  },
);
