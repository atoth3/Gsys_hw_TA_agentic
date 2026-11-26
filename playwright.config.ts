import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // performance_glitch_user's login submit takes ~10s; give the suite headroom for that.
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html'],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : 'list',
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: process.env.CI ? 'on-first-retry' : 'off',
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /case-5-rest-api\.spec\.ts/,
    },
    {
      name: 'api',
      // Case 5 is a REST API test against a different host; no browser is launched for it.
      use: { baseURL: 'https://jsonplaceholder.typicode.com' },
      testMatch: /case-5-rest-api\.spec\.ts/,
    },
  ],
});
