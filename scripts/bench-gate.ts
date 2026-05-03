import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../vitest.shared.js';
import { ensureArtifactContext } from './artifact-context.js';
import { writeTextFile } from './audit/shared.js';
import {
  DEFAULT_GATE_REPLICATES,
  buildDirectiveBenchConfig,
  evaluateBenchPairsAcrossReplicates,
  formatDiagnosticWatchReport,
  formatPairReport,
  formatWorkerStartupSeamReport,
  runDirectiveBenchReplicates,
  summarizeLLMRuntimeSteadySignals,
  summarizeWorkerStartupAudit,
  summarizeWorkerStartupSplit,
  type ReplicateResult,
} from './bench/directive-suite.ts';
import { lookupCachedReplicates } from './bench/replicate-cache.ts';

interface BenchTaskSummary {
  readonly name: string;
  readonly medianMeanNs: number | null;
  readonly medianP75Ns: number | null;
  readonly medianP99Ns: number | null;
  readonly spreadMeanNs: number | null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

async function resolveReplicates(
  sourceFingerprint: string,
  environmentFingerprint: string,
): Promise<{ readonly replicates: readonly ReplicateResult[]; readonly source: 'cache' | 'fresh' }> {
  const cached = lookupCachedReplicates(repoRoot, {
    sourceFingerprint,
    environmentFingerprint,
    expectedReplicateCount: DEFAULT_GATE_REPLICATES,
  });

  if (cached) {
    return { replicates: cached, source: 'cache' };
  }

  const fresh = await runDirectiveBenchReplicates(DEFAULT_GATE_REPLICATES);
  return { replicates: fresh, source: 'fresh' };
}

async function main(): Promise<void> {
  const artifactDir = resolve(repoRoot, 'benchmarks');
  const context = ensureArtifactContext(repoRoot);
  const benchConfig = buildDirectiveBenchConfig(DEFAULT_GATE_REPLICATES);
  const { replicates, source } = await resolveReplicates(
    context.sourceFingerprint,
    context.environmentFingerprint,
  );
  console.log(
    source === 'cache'
      ? `[bench-gate] Reusing replicates from benchmarks/directive-bench.json (same source + environment fingerprint).`
      : `[bench-gate] Running ${DEFAULT_GATE_REPLICATES} fresh replicates (no matching cache; fingerprint drift or missing artifact).`,
  );
  const pairResults = evaluateBenchPairsAcrossReplicates(replicates);
  const workerStartupAudit = summarizeWorkerStartupAudit(replicates);
  const workerStartupSplit = summarizeWorkerStartupSplit(replicates);
  const llmRuntimeSteadySignals = summarizeLLMRuntimeSteadySignals(replicates);
  const failedHardGates = pairResults.filter((result) => result.gate && !result.pass);
  const workerResult = pairResults.find((result) => result.label === 'worker');

  function summarizeTask(name: string): BenchTaskSummary {
    const samples = replicates
      .map((replicate) => replicate.results.find((result) => result.name === name) ?? null)
      .filter((result): result is NonNullable<typeof result> => result !== null);
    const meanSamples = samples.map((sample) => sample.meanNs);

    return {
      name,
      medianMeanNs: median(meanSamples),
      medianP75Ns: median(samples.map((sample) => sample.p75Ns)),
      medianP99Ns: median(samples.map((sample) => sample.p99Ns)),
      spreadMeanNs:
        meanSamples.length === 0 ? null : Number((Math.max(...meanSamples) - Math.min(...meanSamples)).toFixed(2)),
    };
  }

  const summary = {
    passed: failedHardGates.length === 0,
    failedHardGates: failedHardGates.map((result) => result.label),
    hardGateCount: pairResults.filter((result) => result.gate).length,
    diagnosticCount: pairResults.filter((result) => !result.gate).length,
  };

  const workerGateDecision = workerResult
    ? {
        promoted: workerResult.gate,
        mode: workerResult.gate ? 'hard-gate' : 'diagnostic',
        passed: workerResult.pass,
        threshold: workerResult.threshold,
        medianOverhead: workerResult.medianOverhead,
        exceedances: workerResult.exceedances,
        validReplicates: workerResult.validReplicates,
        rationale: workerResult.rationale,
      }
    : null;

  const canarySummaries = benchConfig.canaryTaskNames.map(summarizeTask);

  writeTextFile(
    resolve(artifactDir, 'directive-gate.json'),
    JSON.stringify(
      {
        schemaVersion: 8,
        generatedAt: new Date().toISOString(),
        gauntletRunId: context.gauntletRunId,
        sourceFingerprint: context.sourceFingerprint,
        environmentFingerprint: context.environmentFingerprint,
        expectedCounts: context.expectedCounts,
        replicateCount: DEFAULT_GATE_REPLICATES,
        benchConfig,
        summary,
        workerGateDecision,
        canaries: canarySummaries,
        workerStartupAudit,
        workerStartupSplit,
        llmRuntimeSteadySignals,
        replicates,
        pairs: pairResults,
      },
      null,
      2,
    ),
  );

  // Append a one-line summary to benchmarks/history.jsonl so bench:trend can
  // gate on rolling-median drift across runs. The directive-gate.json above
  // is overwritten every run; this jsonl is append-only history. Source +
  // environment fingerprints let the trend script dedupe runs that reused
  // cached replicates (i.e. no real new measurement).
  const historyEntry = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    replicateSource: source,
    canaries: canarySummaries.map((c) => ({
      name: c.name,
      medianMeanNs: c.medianMeanNs,
      medianP99Ns: c.medianP99Ns,
    })),
    pairs: pairResults.map((p) => ({
      label: p.label,
      gate: p.gate,
      medianOverhead: p.medianOverhead,
    })),
  };
  appendFileSync(resolve(artifactDir, 'history.jsonl'), `${JSON.stringify(historyEntry)}\n`);

  console.log('\n=== BENCH GATE: Directive Overhead Check ===\n');

  for (const result of pairResults) {
    for (const line of formatPairReport(result)) {
      console.log(line);
    }
    if (result.label === 'worker-runtime-startup') {
      for (const line of formatWorkerStartupSeamReport(workerStartupSplit)) {
        console.log(line);
      }
    }
  }

  const watchLines = formatDiagnosticWatchReport(pairResults);
  if (watchLines.length > 0) {
    console.log('\n--- DIAGNOSTIC WATCHLIST ---\n');
    for (const line of watchLines) {
      console.log(line);
    }
  }

  console.log('');

  if (failedHardGates.length > 0) {
    console.error('BENCH GATE FAILED: One or more hard-gated directive benchmarks exceeded the threshold.');
    process.exitCode = 1;
    return;
  }

  console.log('BENCH GATE PASSED: All hard-gated directive benchmarks stayed within threshold.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
