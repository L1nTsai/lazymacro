import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure" },
  webServer: [
    {
      command: "pnpm exec tsx e2e/mock-ai-server.ts",
      url: "http://localhost:3199/__stats",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec next start -p 3100",
      url: "http://localhost:3100/manifest.webmanifest",
      reuseExistingServer: false,
      // The real SDKs, pointed at the stand-in. Real keys are never used in tests.
      env: {
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: "http://localhost:3199",
        GEMINI_API_KEY: "test-key",
        GOOGLE_GEMINI_BASE_URL: "http://localhost:3199",
      },
    },
  ],
  projects: [
    { name: "iphone-safari", testIgnore: /desktop/, use: { ...devices["iPhone 14"] } },
    {
      name: "android-chrome",
      testIgnore: /desktop/,
      use: {
        ...devices["Pixel 7"],
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
    // The smallest screen the no-scrolling rule has to hold on.
    { name: "small-iphone", testIgnore: /desktop/, use: { ...devices["iPhone SE"] } },
    // The smallest desktop window the no-scrolling rule has to hold on.
    { name: "desktop", testMatch: /desktop/, use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 700 } } },
  ],
});
