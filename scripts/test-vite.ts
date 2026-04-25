import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const script = resolve(import.meta.dirname, '..', 'tests/integration/vite/test.ts');
await import(pathToFileURL(script).href);
