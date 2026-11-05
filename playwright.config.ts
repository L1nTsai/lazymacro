import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure" },
  webServer: { command: "pnpm exec next start -p 3100", url: "http://localhost:3100/manifest.webmanifest", reuseExistingServer: false },
  projects: [
    { name: "iphone-safari", use: { ...devices["iPhone 14"] } },
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
