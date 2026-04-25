import { resolve } from 'node:path';
const script = resolve(import.meta.dirname, '..', 'tests/integration/vite/test.ts');
await import(script);
//# sourceMappingURL=test-vite.js.map
