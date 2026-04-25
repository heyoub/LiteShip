/**
 * Merge subprocess v8 coverage dumps into coverage/node/coverage-final.json.
 *
 * Runs after `pnpm coverage:node` exits. Walks the directory pointed to by
 * CZAP_SUBPROCESS_COVERAGE_DIR (set by the coverage:merge wrapper script
 * before running vitest), converts each raw v8 dump via v8-to-istanbul, and
 * unions the result into coverage-final.json using istanbul-lib-coverage's
 * CoverageMap.merge.
 *
 * This is the fallback path proven necessary by the Task 1 spike. Vitest's
 * inspector-API coverage doesn't see grandchildren of test workers; subprocess
 * dumps go through this script instead.
 *
 * @module
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import V8ToIstanbul from 'v8-to-istanbul';
import { coverageInclude, coverageExclude, repoRoot } from '../vitest.shared.js';
import { minimatch } from 'minimatch';

const { createCoverageMap } = libCoverage;

// Hardcoded relative to repo root so this script doesn't depend on env vars
// surviving across pnpm script chains (cross-env only persists inside the
// subshell where it was applied).
const dumpDir = resolve(repoRoot, 'coverage', 'subprocess-raw');
if (!existsSync(dumpDir)) {
  console.log(`[merge-subprocess-v8] ${dumpDir} does not exist — skipping (no subprocess dumps yet)`);
  process.exit(0);
}

const finalPath = resolve(repoRoot, 'coverage', 'node', 'coverage-final.json');
if (!existsSync(finalPath)) {
  console.error(`[merge-subprocess-v8] missing ${finalPath} — run pnpm coverage:node first`);
  process.exit(1);
}

const finalMap = createCoverageMap({});
finalMap.merge(JSON.parse(readFileSync(finalPath, 'utf8')) as Record<string, unknown>);

const dumpFiles = readdirSync(dumpDir).filter((f) => f.startsWith('coverage-') && f.endsWith('.json'));
console.log(`[merge-subprocess-v8] processing ${dumpFiles.length} v8 dump file(s) from ${dumpDir}`);

let mergedCount = 0;

for (const dumpName of dumpFiles) {
  const dumpPath = resolve(dumpDir, dumpName);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as { result: Array<{ url: string; functions: unknown[] }> };
  if (!Array.isArray(dump.result)) continue;

  const subMap = createCoverageMap({});

  for (const script of dump.result) {
    if (!script.url) continue;
    // Only file:// URLs that resolve into the repo's packages/*/src tree.
    if (!script.url.startsWith('file://')) continue;
    const filePath = decodeURIComponent(new URL(script.url).pathname);
    const normalized = process.platform === 'win32' && filePath.startsWith('/')
      ? filePath.slice(1).replace(/\//g, '\\')
      : filePath;
    const relForGlob = normalized.replace(/\\/g, '/').replace(`${repoRoot.replace(/\\/g, '/')}/`, '');

    const included = coverageInclude.some((pat) => minimatch(relForGlob, pat));
    if (!included) continue;
    const excluded = coverageExclude.some((pat) => minimatch(relForGlob, pat));
    if (excluded) continue;

    try {
      const converter = new V8ToIstanbul(pathToFileURL(normalized).href, 0);
      await converter.load();
      converter.applyCoverage(script.functions);
      const fileData = converter.toIstanbul();
      subMap.merge(fileData);
    } catch (err) {
      // Skip files that v8-to-istanbul can't resolve (e.g. virtual modules).
      console.warn(`[merge-subprocess-v8] skip ${relForGlob}: ${(err as Error).message}`);
    }
  }

  finalMap.merge(subMap);
  mergedCount++;
}

writeFileSync(finalPath, JSON.stringify(finalMap.toJSON(), null, 2));
console.log(`[merge-subprocess-v8] merged ${mergedCount} subprocess dump(s) into ${finalPath}`);
