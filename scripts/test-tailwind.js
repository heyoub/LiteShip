import { resolve } from 'node:path';
const script = resolve(import.meta.dirname, '..', 'tests/integration/tailwind/test.ts');
await import(script);
//# sourceMappingURL=test-tailwind.js.map
