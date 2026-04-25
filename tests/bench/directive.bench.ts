// TODO(bang2/task10): uncomment when resolvePrimitive is implemented
// import { resolvePrimitive } from '@czap/vite';
// bench.add('resolvePrimitive(boundary) -- same-dir hit', async () => {
//   await resolvePrimitive('boundary', 'primary', join(root, 'src/panel.css'), root);
// });

import {
  DEFAULT_GATE_REPLICATES,
  collectBenchResults,
  createDirectiveBench,
  evaluateBenchPairsAcrossReplicates,
  formatDiagnosticWatchReport,
  formatPairReport,
  runDirectiveBenchReplicates,
} from '../../scripts/bench/directive-suite.ts';
import { writeDirectiveBenchArtifact } from '../../scripts/bench/replicate-cache.ts';
import { ensureArtifactContext } from '../../scripts/artifact-context.ts';
import { repoRoot } from '../../vitest.shared.ts';

async function main(): Promise<void> {
  const bench = createDirectiveBench();

  await bench.run();

  console.table(bench.table());

  console.log('\n--- DIRECTIVE DIAGNOSTIC OUTPUT ---\n');

  const results = collectBenchResults(bench);

  for (const result of results) {
    const tierIcon =
      result.latencyTier === 'minimal'
        ? '[*]'
        : result.latencyTier === 'light'
          ? '[+]'
          : result.latencyTier === 'moderate'
            ? '[=]'
            : result.latencyTier === 'heavy'
              ? '[-]'
              : '[!]';
    console.log(`${tierIcon} ${result.latencyTier.padEnd(8)} ${result.name}`);
    console.log(
      `     mean: ${result.meanNs.toFixed(1)}ns  p75: ${result.p75Ns.toFixed(1)}ns  p99: ${result.p99Ns.toFixed(1)}ns  (${(result.opsPerSec / 1e6).toFixed(1)}M ops/s)`,
    );
  }

  console.log('\n--- DIRECTIVE vs MANUAL PAIRS ---\n');

  const replicates = await runDirectiveBenchReplicates(DEFAULT_GATE_REPLICATES);
  const pairResults = evaluateBenchPairsAcrossReplicates(replicates);
  const failedHardGates = pairResults.filter((result) => result.gate && !result.pass);

  // Persist raw replicate data so `pnpm run bench:gate` can reuse the samples
  // instead of running a redundant 5-replicate pass (the gauntlet orders bench
  // immediately before bench:gate). Fingerprint lookup in bench:gate hard-fails
  // to a fresh run if source or environment drift, so gate rigor is preserved.
  const context = ensureArtifactContext(repoRoot);
  writeDirectiveBenchArtifact(repoRoot, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    replicateCount: DEFAULT_GATE_REPLICATES,
    replicates,
  });

  for (const result of pairResults) {
    for (const line of formatPairReport(result)) {
      console.log(line);
    }
    console.log('');
  }

  const watchLines = formatDiagnosticWatchReport(pairResults);
  if (watchLines.length > 0) {
    console.log('--- DIAGNOSTIC WATCHLIST ---\n');
    for (const line of watchLines) {
      console.log(line);
    }
    console.log('');
  }

  if (failedHardGates.length > 0) {
    console.error('DIRECTIVE OVERHEAD GATE: FAILED -- one or more hard-gated directive pairs exceed the threshold');
    process.exitCode = 1;
    return;
  }

  console.log('DIRECTIVE OVERHEAD GATE: PASSED -- all hard-gated directive pairs are within threshold');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
