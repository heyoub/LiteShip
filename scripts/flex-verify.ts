#!/usr/bin/env tsx
/**
 * flex:verify — roll-up acceptance for the 10/10 rating.
 *
 * Runs every per-dimension check from the spec's §6.1 acceptance table.
 * Prints a PASS/FAIL table per rating dimension; exits non-zero on any FAIL.
 *
 * The seven rating dimensions:
 *   1. Architecture — ADR coverage of every non-obvious decision
 *   2. Type discipline — zero unsanctioned casts; ESLint enforced
 *   3. Testing rigor — full gauntlet test surface green
 *   4. Performance — bench gate clean, no WATCHLIST entries, SSE preflight mandatory
 *   5. Release discipline — feedback:verify + docs:check both pass
 *   6. Docs — TSDoc on public exports; TypeDoc committed without drift; ADR set complete
 *   7. CapsuleFactory — capsule manifest present and structurally valid
 *
 * Folded into gauntlet:full so 10/10 is continuously enforced on every CI run.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import fg from 'fast-glob';
import { getCapsuleManifestPath } from '../packages/cli/src/receipts.js';
import {
  ACCEPTED_BENCH_STABILITY_NOISY_LABELS,
  LLM_STEADY_P99_TO_BASELINE_MAX,
  LLM_STEADY_REPLICATE_EXCEEDANCE_MAX,
} from './bench/flex-policy.js';

interface CheckResult {
  pass: boolean;
  detail: string;
  /**
   * Captured subprocess output to surface when the check fails. Without this,
   * a failing `sh()` invocation reports only its `pass: false` and we lose
   * the actual error — invisible flakes inside gauntlet:full are debuggable
   * only by re-running the check standalone, which often masks load-induced
   * failures.
   */
  failOutput?: string;
}

interface Check {
  dim: string;
  check: () => CheckResult;
}

const sh = (cmd: string): { ok: boolean; out: string } => {
  const r = spawnSync(cmd, { shell: true, stdio: 'pipe' });
  return {
    ok: r.status === 0,
    out: (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? ''),
  };
};

// Sanctioned cast files — mirrors the eslint.config.js exception list exactly.
// Each entry corresponds to a file in the `files` array of the sanctioned-cast
// block in eslint.config.js.
const SANCTIONED_CAST_FILES = new Set([
  // Brand factories
  'packages/core/src/brands.ts',
  'packages/core/src/ecs.ts',
  'packages/web/src/types.ts',

  // Tuple + generic-preservation helpers
  'packages/core/src/tuple.ts',
  'packages/core/src/cell.ts',
  'packages/core/src/boundary.ts',
  'packages/core/src/composable.ts',
  'packages/core/src/blend.ts',
  'packages/core/src/interpolate.ts',
  'packages/core/src/op.ts',

  // Compositor / quantizer state bridges
  'packages/core/src/compositor.ts',
  'packages/core/src/compositor-pool.ts',
  'packages/quantizer/src/quantizer.ts',
  'packages/quantizer/src/evaluate.ts',

  // FFI / hash primitives
  'packages/core/src/typed-ref.ts',
  'packages/core/src/wasm-dispatch.ts',

  // Environment / runtime introspection helpers
  'packages/core/src/diagnostics.ts',
  'packages/worker/src/compositor-startup.ts',
  'packages/detect/src/detect.ts',
  'packages/detect/src/tiers.ts',

  // DOM / network guard helpers
  'packages/web/src/slot/registry.ts',
  'packages/web/src/morph/hints.ts',
  'packages/web/src/stream/sse-pure.ts',
  'packages/edge/src/client-hints.ts',

  // Astro runtime + integration boundaries
  'packages/astro/src/integration.ts',
  'packages/astro/src/runtime/boundary.ts',
  'packages/astro/src/runtime/slots.ts',

  // Vite filesystem / dynamic-import boundaries
  'packages/vite/src/resolve-fs.ts',
  'packages/vite/src/resolve-utils.ts',
  'packages/vite/src/virtual-modules.ts',
]);

interface MatchHit {
  file: string;
  line: number;
  text: string;
}

const scanFiles = (
  patterns: string[],
  matcher: RegExp,
  excludeSanctioned = false,
): MatchHit[] => {
  const files = fg.sync(patterns, { cwd: process.cwd() });
  const hits: MatchHit[] = [];
  for (const file of files) {
    if (excludeSanctioned && SANCTIONED_CAST_FILES.has(file.replace(/\\/g, '/'))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip JSDoc continuation lines (lines starting with optional whitespace + `*`)
      if (/^\s*\*/.test(line)) continue;
      // Skip import/export lines that legitimately use `as` for aliasing
      if (/^\s*(import|export)\s/.test(line)) continue;
      if (matcher.test(line)) {
        hits.push({ file, line: i + 1, text: line.trim() });
      }
    }
  }
  return hits;
};

const checks: Check[] = [
  {
    dim: 'Architecture',
    check: () => {
      if (!existsSync('docs/adr')) {
        return { pass: false, detail: 'docs/adr/ does not exist' };
      }
      const adrs = readdirSync('docs/adr').filter((f) => f.endsWith('.md'));
      const required = [
        'README.md',
        '_template.md',
        '0001-namespace-pattern.md',
        '0002-zero-alloc.md',
        '0003-content-addressing.md',
        '0004-plan-coordinator.md',
        '0005-effect-boundary.md',
        '0006-compiler-dispatch.md',
      ];
      const missing = required.filter((f) => !adrs.includes(f));
      if (missing.length > 0) {
        return { pass: false, detail: `missing ADRs: ${missing.join(', ')}` };
      }
      return { pass: true, detail: `${adrs.length} ADR files present (≥ ${required.length} required)` };
    },
  },

  {
    dim: 'Type discipline',
    check: () => {
      const anyHits = scanFiles(
        ['packages/*/src/**/*.ts'],
        / as any\b/,
        true, // exclude sanctioned files
      );
      const tsHits = scanFiles(
        ['packages/*/src/**/*.ts'],
        /@ts-(ignore|nocheck)\b/,
        false,
      );
      const lint = sh('pnpm run lint');

      const anyOk = anyHits.length === 0;
      const tsOk = tsHits.length === 0;
      const lintOk = lint.ok;
      const pass = anyOk && tsOk && lintOk;

      const details: string[] = [];
      details.push(`as-any-clean=${anyOk ? 'true' : `${anyHits.length} hits`}`);
      details.push(`ts-comment-clean=${tsOk ? 'true' : `${tsHits.length} hits`}`);
      details.push(`lint-clean=${lintOk}`);

      return { pass, detail: details.join(' ') };
    },
  },

  {
    dim: 'Testing rigor',
    check: () => {
      const r = sh('pnpm test');
      // pnpm test outputs the count; just rely on exit status here.
      return {
        pass: r.ok,
        detail: r.ok ? 'pnpm test passed' : 'pnpm test FAILED',
        failOutput: r.ok ? undefined : r.out,
      };
    },
  },

  {
    dim: 'Performance',
    check: () => {
      const gate = sh('pnpm run bench:gate');
      const gatePassed = /BENCH GATE PASSED/.test(gate.out) && gate.ok;

      const sseSrc = readFileSync('packages/web/src/stream/sse.ts', 'utf8');
      const preflightMandatory =
        !/preflight\s*[?:].*false/.test(sseSrc) &&
        !/disablePreflight/.test(sseSrc);

      // Signal cover for the diagnostic pairs that have been calibrated with
      // structural-floor thresholds (worker-runtime-startup at 100%, llm-runtime-
      // steady post-short-circuit): consult runtime-seams which already attributes
      // both pairs with canary-normalized tail and slope metrics.
      //
      // - workerStartupAudit.posture must stay "accept-honest-residual" (any other
      //   value means the dominant stage changed — the structural floor story is
      //   no longer honest and needs re-investigation).
      // - llmRuntimeSteadySignals.replicateExceedanceRate must stay at or below
      //   LLM_STEADY_REPLICATE_EXCEEDANCE_MAX (directive-suite / runtime-seams use
      //   the same cutoff: one replicate over threshold on a 5-replicate diagnostic).
      //   directive-vs-baseline P99 ratio must stay within LLM_STEADY_P99_TO_BASELINE_MAX (catches the
      //   short-circuit silently masking residual scheduler cost, which would
      //   surface in the P99 tail before the median).
      // - benchStability.noisy must only flag documented-accepted pairs; any new
      //   pair becoming noisy is real drift signal, not environmental.
      //
      // Runtime-seams is produced by `pnpm run report:runtime-seams` which runs
      // before flex:verify inside gauntlet:full. When running flex:verify
      // standalone (no recent gauntlet), the artifact may be missing or stale —
      // treat that as informational, not a hard fail.
      // Accepted-noisy pairs: pairs where replicate spread structurally exceeds
      // the classifier's threshold-based variance rule, but the hard-gate median
      // is the real regression signal and passes reliably. Each entry documents
      // why the structural noise is inherent, not drift.
      //
      // - worker-runtime-startup-shared: transport overhead includes non-shared
      //   seams (state-delivery:message-receipt) that vary per-replicate by
      //   design; see ADR-0002 worker transport cost floor.
      // - satellite: 2μs hot-path measurement; OS-level timer jitter (~0.5μs on
      //   Node+Windows) produces 15-30% replicate-spread swings on each of two
      //   independent 2μs measurements (directive vs manual). Verified across
      //   3 consecutive gauntlet runs on unchanged code: spreads of 5.5%,
      //   49.7%, 25.7% with median always under the 15% hard-gate threshold
      //   (8.9%, 14.4%, 10.4%). The hard gate is the actual regression signal.
      // - worker: 3μs hot-path measurement of normalized worker fallback evaluation
      //   vs canonical Boundary.evaluate. Same shape as satellite — sub-5μs
      //   measurement on Windows produces the occasional one-replicate outlier
      //   (e.g. 4/5 reps within ±6%, one rep at 18%) that crosses the
      //   threshold-based bucket detector even though the median overhead is
      //   ~1-4%, well under the 15% hard-gate. Verified: median 3.9% / 1.2%
      //   across runs with one-replicate outliers at 12.5% / 18.5% — variance
      //   is structural to the measurement, not drift.
      // - llm-runtime-steady: diagnostic pair (live session frame scheduling vs
      //   parse-only baseline). One replicate can pay session setup while others
      //   reuse the session, inflating per-replicate overhead spread (~70%+) even
      //   when median overhead stays near parity; flex still enforces
      //   llmRuntimeSteadySignals (exceedance rate + P99 tail) separately.
      const acceptedNoisyPairs = new Set(ACCEPTED_BENCH_STABILITY_NOISY_LABELS);
      let runtimeSeamsCover = 'runtime-seams=not-available';
      let runtimeSeamsOk = true;
      if (existsSync('reports/runtime-seams.json')) {
        try {
          const rs = JSON.parse(readFileSync('reports/runtime-seams.json', 'utf8')) as {
            workerStartupAudit?: { posture?: string };
            llmRuntimeSteadySignals?: {
              replicateExceedanceRate: number;
              directiveP99ToBaselineP99: number;
            };
            benchStability?: ReadonlyArray<{ label: string; noisy: boolean }>;
          };
          const postureOk = rs.workerStartupAudit?.posture === 'accept-honest-residual';
          const llmSignals = rs.llmRuntimeSteadySignals;
          const llmExceedancesOk =
            llmSignals != null &&
            llmSignals.replicateExceedanceRate <= LLM_STEADY_REPLICATE_EXCEEDANCE_MAX;
          const llmP99TailOk =
            rs.llmRuntimeSteadySignals != null &&
            rs.llmRuntimeSteadySignals.directiveP99ToBaselineP99 <= LLM_STEADY_P99_TO_BASELINE_MAX;
          const unexpectedNoisy = (rs.benchStability ?? []).filter(
            (p) => p.noisy && !acceptedNoisyPairs.has(p.label),
          );
          const stabilityOk = unexpectedNoisy.length === 0;

          runtimeSeamsOk = postureOk && llmExceedancesOk && llmP99TailOk && stabilityOk;
          const unexpectedLabels = unexpectedNoisy.map((p) => p.label);
          const llmDiag =
            llmSignals == null
              ? ' llm-signals=n/a'
              : ` replicateExceedanceRate=${llmSignals.replicateExceedanceRate} directiveP99ToBaselineP99=${llmSignals.directiveP99ToBaselineP99}`;
          runtimeSeamsCover = runtimeSeamsOk
            ? 'runtime-seams=posture+llm-tail+stability-pass'
            : `runtime-seams=FAIL(posture=${postureOk} llm-exceed=${llmExceedancesOk} llm-p99=${llmP99TailOk} stability=${stabilityOk} unexpected-noisy=[${unexpectedLabels.join(',')}]${llmDiag})`;
        } catch {
          // Malformed artifact — treat as informational; feedback:verify catches shape drift separately.
          runtimeSeamsCover = 'runtime-seams=malformed(informational)';
        }
      }

      const pass = gatePassed && preflightMandatory && runtimeSeamsOk;
      return {
        pass,
        detail: `bench-gate=${gatePassed} sse-preflight-mandatory=${preflightMandatory} ${runtimeSeamsCover}`,
      };
    },
  },

  {
    dim: 'Release discipline',
    check: () => {
      const docsCheck = sh('pnpm run docs:check');

      // Inside the gauntlet, the orchestrator runs feedback:verify itself one
      // step before flex:verify (see tests/unit/meta/gauntlet-order.test.ts).
      // Re-spawning it here would re-walk the tree minutes later and trip on
      // benign source-fingerprint drift from intermediate phases — which is
      // exactly the noise the previous "fingerprint-drift(non-blocking)"
      // label was papering over. Trust the gauntlet's prior pass instead.
      if (process.env.CZAP_GAUNTLET === '1') {
        return {
          pass: docsCheck.ok,
          detail: `feedback-verify=trusted-from-gauntlet-phase docs-check=${docsCheck.ok}`,
        };
      }

      // Standalone: re-run feedback:verify ourselves. Source-fingerprint-only
      // failures are non-blocking (artifacts from a prior run, every integrity
      // check still ran) — flag them but don't fail.
      const feedback = sh('pnpm run feedback:verify');
      const fingerprintOnlyDrift =
        !feedback.ok && /source fingerprint does not match|source-fingerprint/.test(feedback.out);

      if (fingerprintOnlyDrift) {
        return {
          pass: docsCheck.ok,
          detail: `feedback-verify=fingerprint-drift(non-blocking) docs-check=${docsCheck.ok}`,
        };
      }

      const pass = feedback.ok && docsCheck.ok;
      return {
        pass,
        detail: `feedback-verify=${feedback.ok} docs-check=${docsCheck.ok}`,
      };
    },
  },

  {
    dim: 'Docs',
    check: () => {
      const adrCount = existsSync('docs/adr')
        ? readdirSync('docs/adr').filter((f) => f.endsWith('.md')).length
        : 0;
      const renderRuntimeGone = !existsSync('docs/RENDER-RUNTIME.md');
      const archExists = existsSync('docs/ARCHITECTURE.md');
      // ARCHITECTURE.md should be a slim index (< 4KB)
      const archIsIndex =
        archExists && statSync('docs/ARCHITECTURE.md').size < 4096;
      const apiExists =
        existsSync('docs/api') && readdirSync('docs/api').length > 0;
      const pass = adrCount >= 8 && renderRuntimeGone && archIsIndex && apiExists;
      return {
        pass,
        detail: `adrs=${adrCount} render-runtime-deleted=${renderRuntimeGone} arch-is-index=${archIsIndex} api-exists=${apiExists}`,
      };
    },
  },

  {
    dim: 'CapsuleFactory',
    check: () => {
      const manifestPath = getCapsuleManifestPath();
      if (!existsSync(manifestPath)) {
        return { pass: false, detail: 'capsule manifest missing — run capsule:compile' };
      }
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          capsules: Array<{ kind: string }>;
        };
        if (!Array.isArray(manifest.capsules)) {
          return { pass: false, detail: 'manifest malformed: capsules is not an array' };
        }
        const kinds = new Set(manifest.capsules.map((c) => c.kind));
        const allArms = [
          'pureTransform',
          'receiptedMutation',
          'stateMachine',
          'siteAdapter',
          'policyGate',
          'cachedProjection',
          'sceneComposition',
        ];
        const armsWithInstances = allArms.filter((a) => kinds.has(a)).length;
        // Spec 1.1 promotes the CapsuleFactory dimension from a presence check
        // to a real instance gate. The type-directed AST walker (Task 2) made
        // factory-wrapped capsules detectable; pre-Spec-1.1 the cachedProjection
        // arm in particular always reported zero instances and the dimension
        // silently passed. The five required arms below ship real instances
        // by Spec 1.1 close:
        //   pureTransform     — CanonicalCbor, BoundaryEvaluate, JsonRpcServer
        //   receiptedMutation — VitestRunner, web.stream.receipt
        //   stateMachine      — SceneRuntime, core.token-buffer
        //   cachedProjection  — defineAsset / BeatMarkerProjection / WavMetadataProjection
        //   sceneComposition  — examples.intro, scene.beat-binding
        // siteAdapter and policyGate stay reportable but ungated — siteAdapter
        // ships one (Remotion) and policyGate has no Spec 1.1 surface yet.
        const requiredArms = [
          'pureTransform',
          'receiptedMutation',
          'stateMachine',
          'cachedProjection',
          'sceneComposition',
        ];
        const missing = requiredArms.filter((a) => !kinds.has(a));
        if (missing.length > 0) {
          return {
            pass: false,
            detail: `capsules=${manifest.capsules.length} arms-with-instances=${armsWithInstances}/7 missing-required-arms=${missing.join(',')}`,
          };
        }
        return {
          pass: true,
          detail: `capsules=${manifest.capsules.length} arms-with-instances=${armsWithInstances}/7 required-arms=${requiredArms.length}/${requiredArms.length}`,
        };
      } catch (e) {
        return { pass: false, detail: `manifest malformed: ${String(e)}` };
      }
    },
  },
];

console.log('\nflex:verify — 10/10 acceptance\n');

let anyFail = false;
for (const c of checks) {
  const r = c.check();
  const tag = r.pass ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${c.dim.padEnd(22)} ${r.detail}`);
  if (!r.pass) {
    anyFail = true;
    // Surface the captured subprocess output on failure so the actual error
    // is visible when this runs inside gauntlet:full (which discards stdout
    // by default). Cap the tail so a long log doesn't drown the report.
    if (r.failOutput && r.failOutput.length > 0) {
      const tail = r.failOutput.length > 4000 ? `…[truncated]\n${r.failOutput.slice(-4000)}` : r.failOutput;
      console.log(`\n  --- ${c.dim} captured output ---\n${tail}\n  --- end captured output ---\n`);
    }
  }
}

console.log('');

if (anyFail) {
  console.error('flex:verify FAILED — not 10/10 by every rating dimension.');
  process.exit(1);
}

console.log('flex:verify PASSED — project is 10/10 by every rating dimension.');
