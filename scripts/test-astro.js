import { resolve } from 'node:path';
const script = resolve(import.meta.dirname, '..', 'tests/integration/astro/test.ts');
await import(script);
//# sourceMappingURL=test-astro.js.map
