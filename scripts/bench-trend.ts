/**
 * Bench trend gate. Reads benchmarks/history.jsonl (written by bench:gate
 * one entry per run) and alerts when canary tasks have drifted past a
 * rolling-median threshold across recent distinct runs.
 *
 * bench:gate enforces absolute thresholds (e.g. 15% directive overhead) on
 * the *current* run. That catches a regression once it crosses the
 * threshold — but a slow creep that reduces headroom run after run is
 * invisible until the threshold finally trips. bench:trend catches the
 * creep early by comparing the latest run against the rolling median of
 * the previous N distinct-fingerprint runs, surfacing drift well below the
 * hard gate's absolute cap.
 *
 * Runs that reused cached replicates (same source + environment
 * fingerprint) are deduplicated to the most-recent entry — they don't
 * represent a new measurement of the system.
 *
 * Skips silently when fewer than `MIN_HISTORY_FOR_GATE` distinct entries
 * are available, so a fresh checkout doesn't start failing immediately.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../vitest.shared.js';

/** Number of most-recent distinct entries to consider as the rolling window. */
const ROLLING_WINDOW = 10;
/** Drift past this fraction of the rolling median fails the gate. */
const DRIFT_THRESHOLD = 0.2;
/** Minimum number of distinct prior runs required before the gate is active. */
const MIN_HISTORY_FOR_GATE = 3;

interface HistoryEntry {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly gauntletRunId: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly replicateSource: string;
  readonly canaries: ReadonlyArray<{
    readonly name: string;
    readonly medianMeanNs: number | null;
    readonly medianP99Ns: number | null;
  }>;
  readonly pairs: ReadonlyArray<{
    readonly label: string;
    readonly gate: boolean;
    readonly medianOverhead: number | null;
  }>;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function readHistory(historyPath: string): readonly HistoryEntry[] {
  if (!existsSync(historyPath)) return [];
  const text = readFileSync(historyPath, 'utf8');
  const entries: HistoryEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as HistoryEntry;
      if (parsed.schemaVersion === 1) entries.push(parsed);
    } catch {
      // History is append-only and resilient to a partially-written tail line
      // (truncation if the writer is killed mid-append). Skipping bad entries
      // matches the merge-subprocess-v8 posture: surface but don't fail.
    }
  }
  return entries;
}

function dedupeByFingerprint(entries: readonly HistoryEntry[]): readonly HistoryEntry[] {
  // Cached-replicate runs reuse the prior numbers; collapsing them to the
  // most-recent observation per (sourceFp, envFp) avoids letting a single
  // measurement dominate the rolling window when it's rerun N times.
  const latest = new Map<string, HistoryEntry>();
  for (const entry of entries) {
    const key = `${entry.sourceFingerprint}::${entry.environmentFingerprint}`;
    latest.set(key, entry);
  }
  return Array.from(latest.values()).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

interface TrendIssue {
  readonly taskName: string;
  readonly latestNs: number;
  readonly rollingMedianNs: number;
  readonly driftPct: number;
}

function main(): void {
  const historyPath = resolve(repoRoot, 'benchmarks', 'history.jsonl');
  const all = readHistory(historyPath);
  if (all.length === 0) {
    console.log('bench:trend — no history yet (benchmarks/history.jsonl missing or empty). Skipping.');
    return;
  }
  const deduped = dedupeByFingerprint(all);
  const window = deduped.slice(-ROLLING_WINDOW);
  if (window.length < MIN_HISTORY_FOR_GATE) {
    console.log(
      `bench:trend — ${window.length} distinct historical run(s) (need ${MIN_HISTORY_FOR_GATE} to gate). ` +
        `Skipping until more runs accumulate.`,
    );
    return;
  }
  const latest = window[window.length - 1];
  const prior = window.slice(0, -1);
  if (!latest) {
    console.log('bench:trend — no latest entry found after windowing. Skipping.');
    return;
  }

  console.log(
    `\nbench:trend — latest vs rolling median of ${prior.length} prior distinct run(s) ` +
      `(drift threshold: ${(DRIFT_THRESHOLD * 100).toFixed(0)}%)\n`,
  );

  const issues: TrendIssue[] = [];
  const canaryNames = new Set(latest.canaries.map((c) => c.name));
  for (const name of canaryNames) {
    const latestEntry = latest.canaries.find((c) => c.name === name);
    if (!latestEntry || latestEntry.medianMeanNs === null) continue;
    const priorMeans = prior
      .map((entry) => entry.canaries.find((c) => c.name === name)?.medianMeanNs ?? null)
      .filter((value): value is number => value !== null);
    if (priorMeans.length < MIN_HISTORY_FOR_GATE - 1) continue;
    const rollingMedian = median(priorMeans);
    if (rollingMedian === null || rollingMedian === 0) continue;
    const driftPct = (latestEntry.medianMeanNs - rollingMedian) / rollingMedian;
    const tag = driftPct > DRIFT_THRESHOLD ? '[!]' : Math.abs(driftPct) > DRIFT_THRESHOLD / 2 ? '[~]' : '   ';
    console.log(
      `  ${tag} ${name.padEnd(56)} ` +
        `${latestEntry.medianMeanNs.toFixed(1).padStart(8)}ns ` +
        `vs ${rollingMedian.toFixed(1).padStart(8)}ns  ` +
        `(${driftPct >= 0 ? '+' : ''}${(driftPct * 100).toFixed(1)}%)`,
    );
    if (driftPct > DRIFT_THRESHOLD) {
      issues.push({
        taskName: name,
        latestNs: latestEntry.medianMeanNs,
        rollingMedianNs: rollingMedian,
        driftPct,
      });
    }
  }

  if (issues.length > 0) {
    console.error(
      `\nbench:trend FAILED — ${issues.length} canary task(s) drifted >${(DRIFT_THRESHOLD * 100).toFixed(0)}% above the rolling median:`,
    );
    for (const issue of issues) {
      console.error(
        `  - ${issue.taskName}: ${issue.latestNs.toFixed(1)}ns vs rolling ${issue.rollingMedianNs.toFixed(1)}ns ` +
          `(+${(issue.driftPct * 100).toFixed(1)}%)`,
      );
    }
    console.error(
      `\nThis is sustained drift across ${prior.length} prior distinct run(s), not single-run jitter. ` +
        `Investigate before bench:gate's absolute threshold trips.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nbench:trend PASSED — no canary drifted >${(DRIFT_THRESHOLD * 100).toFixed(0)}% above rolling median.`);
}

main();
