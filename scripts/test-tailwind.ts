import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const script = resolve(import.meta.dirname, '..', 'tests/integration/tailwind/test.ts');
await import(pathToFileURL(script).href);
