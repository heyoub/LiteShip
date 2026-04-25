/**
 * capsule inspect / verify / list — read operations on the manifest.
 * inspect returns one entry; list returns all (optionally filtered by
 * --kind); verify runs the generated test for a capsule.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { emit, emitError } from '../receipts.js';
import { VitestRunner } from '../capsules/vitest-runner.js';

interface ManifestEntry {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly generated: { testFile: string; benchFile: string };
}

interface Manifest { readonly capsules: readonly ManifestEntry[]; }

function loadManifest(): Manifest | null {
  const path = 'reports/capsule-manifest.json';
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** Execute `capsule inspect <id>`. */
export async function capsuleInspect(id: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.inspect', 'manifest missing'); return 1; }
  const entry = m.capsules.find((c) => c.name === id);
  if (!entry) { emitError('capsule.inspect', `capsule not found: ${id}`); return 1; }
  emit({
    status: 'ok', command: 'capsule.inspect',
    timestamp: new Date().toISOString(), capsule: entry,
  });
  return 0;
}

/** Execute `capsule list [--kind=<kind>]`. */
export async function capsuleList(kind?: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.list', 'manifest missing'); return 1; }
  const capsules = kind ? m.capsules.filter((c) => c.kind === kind) : m.capsules;
  emit({
    status: 'ok', command: 'capsule.list',
    timestamp: new Date().toISOString(),
    capsules, kind: kind ?? null,
  });
  return 0;
}

/** Execute `capsule verify <id>`. */
export async function capsuleVerify(id: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.verify', 'manifest missing'); return 1; }
  const entry = m.capsules.find((c) => c.name === id);
  if (!entry) { emitError('capsule.verify', `capsule not found: ${id}`); return 1; }
  const { exitCode, stderrTail } = await VitestRunner.run({ testFiles: [entry.generated.testFile] });
  if (exitCode !== 0) {
    emitError('capsule.verify', `generated tests failed${stderrTail ? `: ${stderrTail.trim()}` : ''}`);
    return 2;
  }
  emit({
    status: 'ok', command: 'capsule.verify',
    timestamp: new Date().toISOString(), capsuleId: entry.name,
  });
  return 0;
}
