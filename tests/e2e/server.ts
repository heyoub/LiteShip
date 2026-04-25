/**
 * E2E test server -- builds bundle via Vite and serves static files via Node HTTP.
 *
 * Default (CI): Pre-builds bundle via Vite build API on startup, serves static IIFE.
 * --watch flag: Rebuilds on file change for manual debugging.
 *
 * Usage:
 *   tsx tests/e2e/server.ts           # CI mode (build once, serve)
 *   tsx tests/e2e/server.ts --watch   # Watch mode (rebuild on change)
 */

import { resolve, join, extname } from 'path';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { watch } from 'fs';
import { build } from 'vite';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const PORT = Number(process.env.PORT ?? 3456);
const WATCH = process.argv.includes('--watch');

const BUNDLE_ENTRIES = {
  '/bundle.js': join(FIXTURES, 'capture-bundle.ts'),
  '/capture-bundle.js': join(FIXTURES, 'capture-bundle.ts'),
  '/stream-bundle.js': join(FIXTURES, 'stream-bundle.ts'),
} as const;

const UNIQUE_BUNDLE_ENTRIES = [...new Set(Object.values(BUNDLE_ENTRIES))];

const bundleResults: Record<string, string | null> = Object.fromEntries(
  UNIQUE_BUNDLE_ENTRIES.map((entry) => [entry, null]),
) as Record<string, string | null>;

async function buildBundle(entry: string): Promise<string> {
  const result = await build({
    root: FIXTURES,
    build: {
      lib: {
        entry,
        formats: ['es'],
        fileName: 'bundle',
      },
      write: false,
      minify: false,
      sourcemap: 'inline',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'silent',
  });

  const output = Array.isArray(result) ? result[0] : result;
  const chunk = output.output.find((o: { type: string }) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('No bundle output');
  return chunk.code;
}

async function rebuildAllBundles(): Promise<void> {
  for (const entry of UNIQUE_BUNDLE_ENTRIES) {
    console.log(`Building bundle from ${entry}...`);
    const code = await buildBundle(entry);
    bundleResults[entry] = code;
    console.log(`Bundle built: ${(Buffer.byteLength(code) / 1024).toFixed(1)} KB`);
  }
}

await rebuildAllBundles();

if (WATCH) {
  console.log('Watch mode enabled -- rebuilding on changes...');
  const dirs = [join(ROOT, 'packages/core/src'), join(ROOT, 'packages/web/src'), FIXTURES];
  for (const dir of dirs) {
    watch(dir, { recursive: true }, async (event, filename) => {
      if (!filename?.endsWith('.ts') && !filename?.endsWith('.tsx')) return;
      console.log(`[watch] ${event} ${filename} -- rebuilding...`);
      try {
        await rebuildAllBundles();
      } catch (err) {
        console.error('[watch] Build failed:', err);
      }
    });
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Serve the bundle
  if (path in BUNDLE_ENTRIES) {
    const entry = BUNDLE_ENTRIES[path as keyof typeof BUNDLE_ENTRIES];
    const bundleResult = bundleResults[entry];
    if (!bundleResult) {
      res.writeHead(503);
      res.end('Bundle not ready');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(bundleResult);
    return;
  }

  // Serve fixture HTML files
  const filename = path === '/' ? 'capture-harness.html' : path.slice(1);
  const filePath = join(FIXTURES, filename);
  const ext = extname(filename);

  try {
    await stat(filePath);
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`E2E server listening on http://localhost:${PORT}`);
});
