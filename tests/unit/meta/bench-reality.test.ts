import { describe, expect, test } from 'vitest';
import { formatSharedStartupLine } from '../../../scripts/bench-reality.js';

describe('bench reality formatting', () => {
  test('uses timer-floor-limited wording for sub-resolution llm startup slices', () => {
    const line = formatSharedStartupLine(
      'Browser llm simple shared startup median',
      {
        rawSamples: [0, 0, 0.1],
        topOutliers: [{ iteration: 2, valueMs: 0.1 }],
        initToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.03 },
        openToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.02 },
        chunkToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.01 },
        resolution: {
          timerResolutionFloorMs: 0.125,
          timerFloorLimited: true,
        },
      },
      {
        label: 'llm-startup-shared',
        gate: true,
        pass: true,
        runtimeClass: 'startup',
        medianOverhead: 0.014,
        threshold: 0.25,
      },
      -101.97,
    );

    expect(line).toContain('timer-floor-limited');
    expect(line).toContain('shared pair PASS @ 1.4%');
    expect(line).not.toContain('divergence -101.97%');
  });

  test('keeps explicit divergence wording when the browser slice is above the timer floor', () => {
    const line = formatSharedStartupLine(
      'Browser llm promoted shared startup median',
      {
        rawSamples: [0.2, 0.3, 0.4],
        topOutliers: [{ iteration: 2, valueMs: 0.4 }],
        initToFirstTokenMs: { min: 0.2, median: 0.3, p75: 0.35, p95: 0.4, p99: 0.4, max: 0.4, mean: 0.3 },
        openToFirstTokenMs: { min: 0.1, median: 0.2, p75: 0.25, p95: 0.3, p99: 0.3, max: 0.3, mean: 0.2 },
        chunkToFirstTokenMs: { min: 0.15, median: 0.2, p75: 0.25, p95: 0.3, p99: 0.3, max: 0.3, mean: 0.22 },
        resolution: {
          timerResolutionFloorMs: 0.125,
          timerFloorLimited: false,
        },
      },
      {
        label: 'llm-promoted-startup-shared',
        gate: true,
        pass: true,
        runtimeClass: 'startup',
        medianOverhead: 0.028,
        threshold: 0.25,
      },
      2.8,
    );

    expect(line).toContain('divergence 2.8%');
    expect(line).not.toContain('timer-floor-limited');
  });
});
