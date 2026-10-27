import { defineConfig } from "@playwright/test";

// E2E runs against the web layer served by Vite. Tauri's WebDriver (tauri-driver) is not
// supported on macOS, so native-shell flows are covered by Rust tests instead.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:1420" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
  },
});
