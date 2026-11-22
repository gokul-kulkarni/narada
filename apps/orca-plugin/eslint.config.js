import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".orca"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Panels run in Orca's sandbox and may import only `orca` and relative files.
    files: ["src/panel.tsx", "src/panel/**", "src/protocol.ts", "src/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!orca(/|$)|\\.)",
              message: "Panels may import only orca and relative files.",
            },
          ],
        },
      ],
    },
  },
);
