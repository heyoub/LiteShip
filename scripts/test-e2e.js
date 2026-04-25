import { resolve } from 'node:path';
import { $ } from 'bun';
const root = resolve(import.meta.dirname, '..');
const config = resolve(root, 'tests/e2e/playwright.config.ts');
await $`bun x playwright test --config=${config}`.cwd(root);
//# sourceMappingURL=test-e2e.js.map
