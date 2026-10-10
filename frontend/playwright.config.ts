import { defineConfig, devices } from '@playwright/test';

// Ports differ from `make dev` (3000/8001) so the suite never meets a dev server.
const frontendPort = process.env.E2E_FRONTEND_PORT ?? '3100';
const backendPort = process.env.E2E_BACKEND_PORT ?? '8101';
const baseURL = `http://127.0.0.1:${frontendPort}`;
const isCI = !!process.env.CI;
// E2E_REUSE_SERVERS=1 attaches to servers already running on these ports (faster iteration)
// E2E_SERVER_LOGS=1 also prints the servers' stdout (access logs, build output)
const serverLogs = process.env.E2E_SERVER_LOGS === '1' ? 'pipe' : 'ignore';
const reuseServers = process.env.E2E_REUSE_SERVERS === '1';

/**
 * End-to-end tests of the main path against the real stack: Django served by
 * Daphne on SQLite, and the production Next.js build in rewrite mode.
 * Run with `make e2e` or `npm run e2e` (see e2e/scripts for how servers start).
 */
export default defineConfig({
  testDir: './e2e',
  // Tests share one database and one IP (rate limits); keep them in order, one at a time
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  expect: { timeout: 10_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bash e2e/scripts/start-backend.sh',
      url: `http://127.0.0.1:${backendPort}/healthz`,
      timeout: 120_000,
      reuseExistingServer: reuseServers,
      stdout: serverLogs,
      stderr: 'pipe',
    },
    {
      command: 'bash e2e/scripts/start-frontend.sh',
      url: baseURL,
      // includes `next build`
      timeout: 300_000,
      reuseExistingServer: reuseServers,
      stdout: serverLogs,
      stderr: 'pipe',
    },
  ],
});
