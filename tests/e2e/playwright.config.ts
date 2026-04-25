import { defineConfig } from '@playwright/test';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../..');
const browserName = (process.env['CZAP_PLAYWRIGHT_BROWSER'] ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  retries: 0,
  use: {
    browserName,
    headless: true,
    baseURL: 'http://localhost:3456',
  },
  webServer: {
    command: `tsx ${resolve(import.meta.dirname, 'server.ts').replace(/\\/g, '/')}`,
    cwd: ROOT,
    port: 3456,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
