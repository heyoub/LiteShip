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

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

// In-process vitest v8 coverage and out-of-process v8-to-istanbul disagree
// about what counts as a statement (different AST visitors), so merging the
// two for the same file inflates the denominator (subprocess adds statement
// IDs that weren't in the in-process map) without backfilling hits onto
// those new IDs — which makes well-covered files *appear* to drop coverage.
//
// Subprocess coverage exists to fill in files that the in-process reporter
// never sees: bootstrap shells like bin.ts / processor.ts / http-server.ts,
// which are excluded from in-process coverage and only execute under spawn.
// For files already present in coverage-final.json (covered in-process),
// the in-process result is authoritative and subprocess data is discarded.
const inProcessFiles = new Set(finalMap.files());

const dumpFiles = readdirSync(dumpDir).filter((f) => f.startsWith('coverage-') && f.endsWith('.json'));
console.log(`[merge-subprocess-v8] processing ${dumpFiles.length} v8 dump file(s) from ${dumpDir}`);

let mergedCount = 0;
let droppedInProcessHits = 0;
let skippedMalformed = 0;

for (const dumpName of dumpFiles) {
  const dumpPath = resolve(dumpDir, dumpName);
  // V8 dumps can be empty or truncated when the producing process is killed
  // mid-write — by us (test cleanup tree-kill on Windows), by the OS (OOM,
  // STATUS_ACCESS_VIOLATION), or by external tooling. A bad dump is missing
  // data, not a build failure: skip it with a warning and continue. The
  // 59-of-60 surviving dumps still produce a valid merged report.
  const raw = readFileSync(dumpPath, 'utf8');
  if (raw.length === 0) {
    skippedMalformed++;
    console.warn(`[merge-subprocess-v8] skipping empty dump ${dumpName} (process killed before flush)`);
    continue;
  }
  let dump: { result: Array<{ url: string; functions: unknown[] }> };
  try {
    dump = JSON.parse(raw) as { result: Array<{ url: string; functions: unknown[] }> };
  } catch (err) {
    skippedMalformed++;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[merge-subprocess-v8] skipping malformed dump ${dumpName}: ${reason}`);
    continue;
  }
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

    if (inProcessFiles.has(normalized)) {
      droppedInProcessHits++;
      continue;
    }

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

if (droppedInProcessHits > 0) {
  console.log(`[merge-subprocess-v8] dropped ${droppedInProcessHits} subprocess script entries already covered in-process`);
}

writeFileSync(finalPath, JSON.stringify(finalMap.toJSON(), null, 2));
console.log(`[merge-subprocess-v8] merged ${mergedCount} subprocess dump(s) into ${finalPath}`);

// Skip rate is a structural metric: each skipped dump is a process that was
// killed mid-write of its v8 coverage profile (typically by withSpawned's
// dispose tree-kill on Windows where there's no graceful signal). A small
// rate is normal; a high rate means we're losing meaningful coverage.
//   - Per-run summary at coverage/subprocess-summary.json (last-run snapshot)
//   - Append to coverage/subprocess-history.jsonl (append-only trend data)
//   - WARN  if skipRate > 5% — visibility, no exit code change
//   - FAIL  if skipRate > 50% — something is fundamentally broken
const totalDumps = dumpFiles.length;
const skipRate = totalDumps === 0 ? 0 : skippedMalformed / totalDumps;
const summary = {
  generatedAt: new Date().toISOString(),
  totalDumps,
  mergedCount,
  skippedMalformed,
  skipRate,
};
const summaryPath = resolve(repoRoot, 'coverage', 'subprocess-summary.json');
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
const historyPath = resolve(repoRoot, 'coverage', 'subprocess-history.jsonl');
appendFileSync(historyPath, `${JSON.stringify({ schemaVersion: 1, ...summary })}\n`);

if (skippedMalformed > 0) {
  const ratePct = (skipRate * 100).toFixed(1);
  if (skipRate > 0.5) {
    console.error(
      `\n[merge-subprocess-v8] FAIL: skip rate ${ratePct}% (${skippedMalformed}/${totalDumps}) ` +
        `exceeds the 50% structural-failure threshold. Coverage data is mostly missing. ` +
        `Investigate the parent that's killing subprocesses before they can flush v8 dumps.`,
    );
    process.exit(1);
  }
  if (skipRate > 0.05) {
    console.warn(
      `\n[merge-subprocess-v8] WARN: skip rate ${ratePct}% (${skippedMalformed}/${totalDumps}) ` +
        `is above the 5% advisory threshold. Coverage gaps will accumulate. ` +
        `See coverage/subprocess-history.jsonl for the trend.`,
    );
  } else {
    console.log(
      `[merge-subprocess-v8] skipped ${skippedMalformed}/${totalDumps} dump(s) (${ratePct}%) — ` +
        `within the 5% advisory threshold; tracked in coverage/subprocess-history.jsonl`,
    );
  }
}
