import { defineConfig } from '@playwright/test';

/**
 * Playwright e2e config. The app is a static site served by Python's http.server
 * (the same `npm start` command). No Ollama or Whisper is required: the app
 * degrades to its tested fallbacks, and the crisis path is fully deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: 'http://localhost:8753',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'python3 -m http.server 8753',
    url: 'http://localhost:8753/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
