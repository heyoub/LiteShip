/**
 * Audit script — lists every function with hit count 0 in the core, web,
 * remotion, cli, mcp-server, scene, and assets packages, with file:line and
 * function name. Used during Track C cleanup to identify what to test.
 *
 * Deleted in Task 21 after the borderline cleanup is complete.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const COVERAGE_PATH = resolve(REPO_ROOT, 'coverage', 'node', 'coverage-final.json');

if (!existsSync(COVERAGE_PATH)) {
  console.error(`Missing ${COVERAGE_PATH} — run pnpm coverage:merge first.`);
  process.exit(1);
}

interface FileCoverage {
  path: string;
  fnMap: Record<string, { name: string; line: number; loc?: { start: { line: number } } }>;
  f: Record<string, number>;
  statementMap?: Record<string, { start: { line: number } }>;
  s?: Record<string, number>;
}

const data = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8')) as Record<string, FileCoverage>;

const TARGET_PACKAGES = ['core', 'web', 'remotion', 'cli', 'mcp-server', 'scene', 'assets'] as const;

interface Uncovered {
  package: string;
  file: string;
  line: number;
  name: string;
  kind: 'function' | 'statement';
}

const uncovered: Uncovered[] = [];

for (const [filePath, fileCoverage] of Object.entries(data)) {
  const m = filePath.replace(/\\/g, '/').match(/packages\/([^/]+)\/src\//);
  if (!m) continue;
  const packageName = m[1];
  if (!TARGET_PACKAGES.includes(packageName as typeof TARGET_PACKAGES[number])) continue;

  const relPath = filePath.replace(/\\/g, '/').replace(/^.*?packages\//, 'packages/');

  for (const [fnId, hits] of Object.entries(fileCoverage.f ?? {})) {
    if (hits === 0) {
      const fn = fileCoverage.fnMap[fnId];
      if (fn) {
        uncovered.push({
          package: packageName,
          file: relPath,
          line: fn.loc?.start.line ?? fn.line,
          name: fn.name || '<anonymous>',
          kind: 'function',
        });
      }
    }
  }

  if (packageName === 'remotion' || packageName === 'scene' || packageName === 'cli' || packageName === 'mcp-server' || packageName === 'assets') {
    for (const [stmtId, hits] of Object.entries(fileCoverage.s ?? {})) {
      if (hits === 0) {
        const stmt = fileCoverage.statementMap?.[stmtId];
        if (stmt) {
          uncovered.push({
            package: packageName,
            file: relPath,
            line: stmt.start.line,
            name: '<statement>',
            kind: 'statement',
          });
        }
      }
    }
  }
}

uncovered.sort((a, b) => {
  if (a.package !== b.package) return a.package.localeCompare(b.package);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

console.log(`Found ${uncovered.length} uncovered entries across ${TARGET_PACKAGES.join(' / ')}:\n`);
let lastPkg = '';
let lastFile = '';
let perFileCount = 0;
for (const u of uncovered) {
  if (u.package !== lastPkg) {
    if (lastPkg) console.log('');
    console.log(`=== ${u.package} ===`);
    lastPkg = u.package;
    lastFile = '';
  }
  if (u.file !== lastFile) {
    if (perFileCount > 5 && lastFile) console.log(`  ... (${perFileCount} total in ${lastFile})`);
    console.log(`  ${u.file}:`);
    lastFile = u.file;
    perFileCount = 0;
  }
  perFileCount++;
  if (perFileCount <= 5) {
    console.log(`    L${u.line}  (${u.kind}) ${u.name}`);
  }
}
if (perFileCount > 5) console.log(`  ... (${perFileCount} total in ${lastFile})`);
