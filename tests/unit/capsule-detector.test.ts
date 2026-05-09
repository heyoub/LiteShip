/**
 * Verifies the type-directed capsule detector finds both direct
 * defineCapsule calls and factory-wrapped capsule calls.
 *
 * Batches every file that needs `detectCapsuleCalls` into one
 * `ts.createProgram` in `beforeAll` — each `it` used to pay the full
 * checker cold-start (~15–25s+ under coverage); one program cuts wall
 * time roughly to a single startup.
 *
 * @module
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { detectCapsuleCalls, WORKSPACE_ALIASES } from '../../scripts/lib/capsule-detector.js';
import { Config } from '@czap/core';

const CANONICAL_CBOR = resolve('packages/core/src/capsules/canonical-cbor.ts');
const ASSETS_SCENE = resolve('examples/scenes/assets.ts');
const BEAT_MARKERS = resolve('packages/assets/src/analysis/beat-markers.ts');

describe(
  'detectCapsuleCalls',
  { timeout: 90_000, hookTimeout: 90_000 },
  () => {
    let allCalls: ReturnType<typeof detectCapsuleCalls>;

    beforeAll(() => {
      allCalls = detectCapsuleCalls([CANONICAL_CBOR, ASSETS_SCENE, BEAT_MARKERS]);
    });

    it('detects direct defineCapsule calls (pureTransform arm)', () => {
      const calls = allCalls.filter((c) => c.file === CANONICAL_CBOR);
      const match = calls.find((c) => c.name === 'core.canonical-cbor');
      expect(match).toBeDefined();
      expect(match?.kind).toBe('pureTransform');
      expect(match?.factory).toBeUndefined();
    });

    it('detects defineAsset factory calls in examples/scenes/assets.ts', () => {
      const calls = allCalls.filter((c) => c.file === ASSETS_SCENE);
      const assetCalls = calls.filter((c) => c.factory === 'defineAsset');
      expect(assetCalls.length).toBeGreaterThan(0);
      expect(assetCalls[0]!.kind).toBe('cachedProjection');
    });

    it('detects BeatMarkerProjection factory calls and extracts string literal args', () => {
      const calls = allCalls.filter((c) => c.file === ASSETS_SCENE);
      const beat = calls.find((c) => c.factory === 'BeatMarkerProjection');
      expect(beat).toBeDefined();
      expect(beat?.kind).toBe('cachedProjection');
      expect(beat?.args).toEqual(expect.arrayContaining(['intro-bed']));
      expect(beat?.name).toBe('intro-bed');
    });

    it('records line numbers and absolute file paths', () => {
      const calls = allCalls.filter((c) => c.file === CANONICAL_CBOR);
      const match = calls.find((c) => c.name === 'core.canonical-cbor');
      expect(match?.file).toBe(CANONICAL_CBOR);
      expect(match?.line).toBeGreaterThan(0);
    });

    it('dedupes nested defineCapsule calls inside factory bodies', () => {
      const calls = allCalls.filter((c) => c.file === BEAT_MARKERS);
      const lines = calls.map((c) => `${c.file}:${c.line}`);
      expect(new Set(lines).size).toBe(lines.length);
    });
  },
);

describe('capsule detector workspace aliases', () => {
  it('WORKSPACE_ALIASES is in sync with Config.toTestAliases (no drift)', () => {
    const canonical = Object.keys(Config.toTestAliases(Config.make({}), process.cwd()));
    const detector = Object.keys(WORKSPACE_ALIASES);
    expect(new Set(detector)).toEqual(new Set(canonical));
  });
});
