import { resolve } from 'node:path';
import { spawnPnpm } from './support/pnpm-process.ts';

const root = resolve(import.meta.dirname!, '..');
const config = resolve(root, 'tests/e2e/playwright.config.ts');
const child = spawnPnpm(['exec', 'playwright', 'test', `--config=${config}`], {
  cwd: root,
  stdio: 'inherit',
});

child.on('close', (code) => process.exit(code ?? 1));
