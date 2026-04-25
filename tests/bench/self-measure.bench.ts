/**
 * Self-measuring benchmark infrastructure.
 *
 * Implements the "benchmarks eat their own product" philosophy:
 * - Uses Boundary.make() for performance threshold classification
 * - Competing implementations run on identical inputs
 * - Diagnostic output teaches, not just reports
 *
 * @module
 */

import { Bench } from 'tinybench';
import { Effect } from 'effect';
import { Boundary, Compositor, TokenBuffer, SpeculativeEvaluator } from '@czap/core';
import { evaluate } from '@czap/quantizer';
import { SPSCRing } from '@czap/worker';
import { classifyThroughputTier, throughputTierBadge } from '../../scripts/bench-format.ts';

const bench = new Bench({ warmupIterations: 200, iterations: 1000 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const boundary3 = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
});

const boundary5 = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'xs'],
    [480, 'sm'],
    [768, 'md'],
    [1024, 'lg'],
    [1440, 'xl'],
  ] as const,
});

const boundaryHyst = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: 50,
});

// ---------------------------------------------------------------------------
// Competing implementations: evaluate vs evaluateWithHysteresis
// ---------------------------------------------------------------------------

bench.add('[COMPETE] Boundary.evaluate -- 3 thresholds', () => {
  Boundary.evaluate(boundary3, 800);
});

bench.add('[COMPETE] Boundary.evaluateWithHysteresis -- 3 thresholds', () => {
  Boundary.evaluateWithHysteresis(boundaryHyst, 800, 'mobile');
});

// ---------------------------------------------------------------------------
// Competing implementations: core evaluate vs quantizer evaluate
// ---------------------------------------------------------------------------

bench.add('[COMPETE] core Boundary.evaluate -- 5 thresholds', () => {
  Boundary.evaluate(boundary5, 800);
});

bench.add('[COMPETE] quantizer evaluate() -- 5 thresholds', () => {
  evaluate(boundary5, 800);
});

// ---------------------------------------------------------------------------
// Competing implementations: TokenBuffer vs SPSCRing (push throughput)
// ---------------------------------------------------------------------------

const tokenBuf = TokenBuffer.make<number>({ capacity: 256 });
const { producer, consumer } = SPSCRing.createPair(256, 1);

bench.add('[COMPETE] TokenBuffer.push -- single token', () => {
  tokenBuf.push(42);
  tokenBuf.drain(1);
});

bench.add('[COMPETE] SPSCRing.push -- single slot', () => {
  producer.push(new Float64Array([42]));
  consumer.pop(new Float64Array(1));
});

// ---------------------------------------------------------------------------
// Speculative evaluator overhead measurement
// ---------------------------------------------------------------------------

const specEval = SpeculativeEvaluator.make(boundaryHyst);

bench.add('[OVERHEAD] SpeculativeEvaluator.evaluate -- near threshold', () => {
  specEval.evaluate(760, 5);
});

bench.add('[OVERHEAD] SpeculativeEvaluator.evaluate -- far from threshold', () => {
  specEval.evaluate(400, 0);
});

// ---------------------------------------------------------------------------
// Compositor empty vs with quantizers
// ---------------------------------------------------------------------------

const emptyCompositor = Effect.runSync(Effect.scoped(Compositor.create()));

bench.add('[SCALE] Compositor.compute -- empty', () => {
  Effect.runSync(emptyCompositor.compute());
});

// ---------------------------------------------------------------------------
// Satellite directive: inline evaluate vs core Boundary.evaluate
// ---------------------------------------------------------------------------

// Inline satellite evaluation (matches packages/astro/src/client-directives/satellite.ts)
function satelliteEvaluate(thresholds: number[], states: string[], value: number): string {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]!) return states[i]!;
  }
  return states[0] ?? '';
}

function satelliteEvaluateWithHysteresis(
  thresholds: number[],
  states: string[],
  hysteresis: number,
  value: number,
  previousState: string,
): string {
  const half = hysteresis / 2;
  const prevIdx = states.indexOf(previousState);
  if (prevIdx === -1) return satelliteEvaluate(thresholds, states, value);
  const rawState = satelliteEvaluate(thresholds, states, value);
  const rawIdx = states.indexOf(rawState);
  if (rawIdx === prevIdx) return states[rawIdx]!;
  if (rawIdx > prevIdx) {
    for (let i = prevIdx + 1; i <= rawIdx; i++) {
      if (value < thresholds[i]! + half) return states[i - 1]!;
    }
  } else {
    for (let i = prevIdx; i > rawIdx; i--) {
      if (value > thresholds[i]! - half) return states[i]!;
    }
  }
  return rawState;
}

const satThresholds = [0, 768, 1280];
const satStates = ['mobile', 'tablet', 'desktop'];

bench.add('[COMPETE] satellite inline evaluate -- 3 thresholds', () => {
  satelliteEvaluate(satThresholds, satStates, 800);
});

bench.add('[COMPETE] core Boundary.evaluate (for satellite) -- 3 thresholds', () => {
  Boundary.evaluate(boundary3, 800);
});

bench.add('[COMPETE] satellite inline hysteresis -- near threshold', () => {
  satelliteEvaluateWithHysteresis(satThresholds, satStates, 50, 760, 'tablet');
});

bench.add('[COMPETE] core evaluateWithHysteresis (for satellite) -- near threshold', () => {
  Boundary.evaluateWithHysteresis(boundaryHyst, 760, 'tablet');
});

// ---------------------------------------------------------------------------
// SSE pure helpers (hoisted for use in [DIRECTIVE] and [OVERHEAD] sections)
// ---------------------------------------------------------------------------

const patchEvent = { data: JSON.stringify({ type: 'patch', data: '<p>hello</p>' }) } as MessageEvent;
const heartbeatEvent = { data: JSON.stringify({ type: 'heartbeat' }) } as MessageEvent;
const invalidEvent = { data: 'not json' } as MessageEvent;

function inlineParseMessage(event: MessageEvent): unknown {
  try {
    const data = JSON.parse(event.data);
    if (!data || typeof data.type !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// [DIRECTIVE] Directive hydration cost
// ---------------------------------------------------------------------------

// Stream: inline SSE parse (matches directive implementation)
bench.add('[DIRECTIVE] stream inline parseMessage -- patch', () => {
  inlineParseMessage(patchEvent);
});

// Worker: inline boundary eval (fallback path when no SharedArrayBuffer)
bench.add('[DIRECTIVE] worker fallback evaluate -- 3 thresholds', () => {
  satelliteEvaluate(satThresholds, satStates, 800);
});

// LLM: chunk parse overhead
const llmTextChunk = '{"type":"text","content":"hello"}';
const llmToolDelta = '{"type":"tool-call-delta","toolArgs":"{\\"q\\":"}';

bench.add('[DIRECTIVE] llm inline chunk parse -- text', () => {
  const data = JSON.parse(llmTextChunk);
  void data.type;
});

bench.add('[DIRECTIVE] llm inline chunk parse -- tool-call-delta', () => {
  const data = JSON.parse(llmToolDelta);
  void data.type;
});

// Satellite: full cycle (parse boundary JSON + evaluate + string concat for setAttribute)
const boundaryJSON = JSON.stringify({
  id: 'hero',
  input: 'viewport.width',
  thresholds: [0, 768, 1280],
  states: ['mobile', 'tablet', 'desktop'],
  hysteresis: 40,
});

bench.add('[DIRECTIVE] satellite full cycle -- parse + evaluate', () => {
  const b = JSON.parse(boundaryJSON);
  satelliteEvaluate(b.thresholds, b.states, 800);
});

// Worker: full composite state build (inline, no Effect)
bench.add('[DIRECTIVE] worker inline composite build -- 1 quantizer', () => {
  const state = satelliteEvaluate(satThresholds, satStates, 800);
  const discrete: Record<string, string> = { layout: state };
  const css: Record<string, string> = { '--czap-layout': state };
  const glsl: Record<string, number> = { u_layout: satStates.indexOf(state) };
  const aria: Record<string, string> = { 'data-czap-layout': state };
  void discrete;
  void css;
  void glsl;
  void aria;
});

// ---------------------------------------------------------------------------
// [OVERHEAD] SSE parseMessage throughput
// ---------------------------------------------------------------------------

bench.add('[OVERHEAD] SSE parseMessage -- valid patch', () => {
  inlineParseMessage(patchEvent);
});

bench.add('[OVERHEAD] SSE parseMessage -- valid heartbeat', () => {
  inlineParseMessage(heartbeatEvent);
});

bench.add('[OVERHEAD] SSE parseMessage -- invalid JSON', () => {
  inlineParseMessage(invalidEvent);
});

// ---------------------------------------------------------------------------
// Run + diagnostic output
// ---------------------------------------------------------------------------

await bench.run();

// Raw table
console.table(bench.table());

// Diagnostic output: classify each result and identify competing pairs
console.log('\n--- DIAGNOSTIC OUTPUT ---\n');

// tinybench v3: result.latency.mean is in ms, result.throughput.mean is ops/s
const results = bench.tasks.map((task) => {
  const lat = task.result?.latency;
  const thr = task.result?.throughput;
  const opsPerSec = thr?.mean ?? 0;
  const meanNs = (lat?.mean ?? 0) * 1e6; // ms → ns
  return {
    name: task.name,
    opsPerSec,
    meanNs,
    tier: classifyThroughputTier(opsPerSec),
    p75Ns: (lat?.p75 ?? 0) * 1e6,
    p99Ns: (lat?.p99 ?? 0) * 1e6,
  };
});

for (const r of results) {
  console.log(`${throughputTierBadge(r.tier)} ${r.tier.padEnd(9)} ${r.name}`);
  console.log(
    `     mean: ${r.meanNs.toFixed(1)}ns  p75: ${r.p75Ns.toFixed(1)}ns  p99: ${r.p99Ns.toFixed(1)}ns  (${(r.opsPerSec / 1e6).toFixed(1)}M ops/s)`,
  );
}

// Competing pairs analysis
console.log('\n--- COMPETING PAIRS ---\n');

const pairs = [
  ['[COMPETE] Boundary.evaluate -- 3 thresholds', '[COMPETE] Boundary.evaluateWithHysteresis -- 3 thresholds'],
  ['[COMPETE] core Boundary.evaluate -- 5 thresholds', '[COMPETE] quantizer evaluate() -- 5 thresholds'],
  ['[COMPETE] TokenBuffer.push -- single token', '[COMPETE] SPSCRing.push -- single slot'],
  [
    '[COMPETE] satellite inline evaluate -- 3 thresholds',
    '[COMPETE] core Boundary.evaluate (for satellite) -- 3 thresholds',
  ],
  [
    '[COMPETE] satellite inline hysteresis -- near threshold',
    '[COMPETE] core evaluateWithHysteresis (for satellite) -- near threshold',
  ],
  // Directive vs overhead pairs
  ['[DIRECTIVE] stream inline parseMessage -- patch', '[OVERHEAD] SSE parseMessage -- valid patch'],
  [
    '[DIRECTIVE] worker fallback evaluate -- 3 thresholds',
    '[COMPETE] core Boundary.evaluate (for satellite) -- 3 thresholds',
  ],
];

for (const [aName, bName] of pairs) {
  const a = results.find((r) => r.name === aName);
  const b = results.find((r) => r.name === bName);
  if (!a || !b) continue;

  const ratio = a.meanNs / b.meanNs;
  const winner = ratio < 1 ? a.name : b.name;
  const speedup = ratio < 1 ? (1 / ratio).toFixed(2) : ratio.toFixed(2);

  console.log(`  ${a.name.replace('[COMPETE] ', '')}`);
  console.log(`    vs`);
  console.log(`  ${b.name.replace('[COMPETE] ', '')}`);
  console.log(`    Winner: ${winner.replace('[COMPETE] ', '')} (${speedup}x faster)`);
  console.log(`    A: ${a.meanNs.toFixed(1)}ns (${a.tier})  B: ${b.meanNs.toFixed(1)}ns (${b.tier})`);
  console.log('');
}
