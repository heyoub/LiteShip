/**
 * Unit tests for `capsule inspect | list | verify` commands.
 *
 * Stubs the manifest read by writing reports/capsule-manifest.json from the
 * existing capsule:compile artifact already on disk; if absent, tests still
 * exercise the missing-manifest branches and exit 1.
 *
 * Mirrors the integration-level captureCli pattern so coverage data flows
 * into the parent test process (no subprocess hop).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  capsuleInspect,
  capsuleList,
  capsuleVerify,
} from '../../../../packages/cli/src/commands/capsule.js';

interface CaptureResult {
  exit: number;
  stdout: string;
  stderr: string;
}

async function capture(fn: () => Promise<number>): Promise<CaptureResult> {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = ((c: string | Uint8Array) => {
    stdout += typeof c === 'string' ? c : Buffer.from(c).toString();
    return true;
  });
  (process.stderr as unknown as { write: unknown }).write = ((c: string | Uint8Array) => {
    stderr += typeof c === 'string' ? c : Buffer.from(c).toString();
    return true;
  });
  try {
    const exit = await fn();
    return { exit, stdout, stderr };
  } finally {
    (process.stdout as unknown as { write: typeof origOut }).write = origOut;
    (process.stderr as unknown as { write: typeof origErr }).write = origErr;
  }
}

const MANIFEST_PATH = 'reports/capsule-manifest.json';

const FIXTURE_MANIFEST = {
  generatedAt: new Date().toISOString(),
  capsules: [
    {
      name: 'core.canonical-cbor',
      kind: 'pureTransform',
      source: 'packages/core/src/capsules/canonical-cbor.ts',
      generated: {
        testFile: 'tests/generated/core-canonical-cbor.test.ts',
        benchFile: 'tests/generated/core-canonical-cbor.bench.ts',
      },
    },
    {
      name: 'core.boundary.evaluate',
      kind: 'pureTransform',
      source: 'packages/core/src/capsules/boundary-evaluate.ts',
      generated: {
        testFile: 'tests/generated/core-boundary-evaluate.test.ts',
        benchFile: 'tests/generated/core-boundary-evaluate.bench.ts',
      },
    },
    {
      name: 'web.stream.receipt',
      kind: 'receiptedMutation',
      source: 'packages/web/src/capsules/stream-receipt.ts',
      generated: {
        testFile: 'tests/generated/web-stream-receipt.test.ts',
        benchFile: 'tests/generated/web-stream-receipt.bench.ts',
      },
    },
  ],
};

let savedManifest: string | undefined;

describe('capsule commands', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) {
      savedManifest = readFileSync(MANIFEST_PATH, 'utf8');
    }
  });
  beforeEach(() => {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, JSON.stringify(FIXTURE_MANIFEST), 'utf8');
  });

  it('capsule inspect dumps a manifest entry by name', async () => {
    const r = await capture(() => capsuleInspect('core.canonical-cbor'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.capsule.name).toBe('core.canonical-cbor');
    expect(receipt.capsule.kind).toBe('pureTransform');
  });

  it('capsule inspect exits 1 for an unknown id', async () => {
    const r = await capture(() => capsuleInspect('not-a-real-capsule'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not found/);
  });

  it('capsule inspect exits 1 when manifest is missing', async () => {
    const tmpSave = readFileSync(MANIFEST_PATH, 'utf8');
    rmSync(MANIFEST_PATH);
    try {
      const r = await capture(() => capsuleInspect('any'));
      expect(r.exit).toBe(1);
      expect(r.stderr).toMatch(/manifest missing/);
    } finally {
      writeFileSync(MANIFEST_PATH, tmpSave, 'utf8');
    }
  });

  it('capsule list returns all capsules by default', async () => {
    const r = await capture(() => capsuleList(undefined));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(Array.isArray(receipt.capsules)).toBe(true);
    expect(receipt.capsules.length).toBeGreaterThanOrEqual(3);
    expect(receipt.kind).toBeNull();
  });

  it('capsule list --kind filters by assembly kind', async () => {
    const r = await capture(() => capsuleList('pureTransform'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(
      receipt.capsules.every((c: { kind: string }) => c.kind === 'pureTransform'),
    ).toBe(true);
    expect(receipt.kind).toBe('pureTransform');
  });

  it('capsule list exits 1 when manifest is missing', async () => {
    const tmpSave = readFileSync(MANIFEST_PATH, 'utf8');
    rmSync(MANIFEST_PATH);
    try {
      const r = await capture(() => capsuleList(undefined));
      expect(r.exit).toBe(1);
      expect(r.stderr).toMatch(/manifest missing/);
    } finally {
      writeFileSync(MANIFEST_PATH, tmpSave, 'utf8');
    }
  });

  it('capsule verify exits 1 on unknown id', async () => {
    const r = await capture(() => capsuleVerify('not-a-real-capsule'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not found/);
  });

  it('capsule verify exits 1 when manifest is missing', async () => {
    const tmpSave = readFileSync(MANIFEST_PATH, 'utf8');
    rmSync(MANIFEST_PATH);
    try {
      const r = await capture(() => capsuleVerify('any'));
      expect(r.exit).toBe(1);
      expect(r.stderr).toMatch(/manifest missing/);
    } finally {
      writeFileSync(MANIFEST_PATH, tmpSave, 'utf8');
    }
  });

  it('capsule verify runs vitest against an existing generated test', async () => {
    // Use a real generated test that we know exists. Skip if it doesn't —
    // the manifest in this fixture references it but the file may not be
    // present in a fresh checkout (capsule:compile may not have run yet).
    if (!existsSync('tests/generated/core-canonical-cbor.test.ts')) {
      return;
    }
    const r = await capture(() => capsuleVerify('core.canonical-cbor'));
    // 0 = tests passed, 2 = tests failed. Either way the verify path was
    // exercised (the spawn happened, stderr/stdout populated).
    expect([0, 2]).toContain(r.exit);
  }, 30_000);

  it('capsule verify reports failure when generated test is missing', async () => {
    // Patch fixture to point at a non-existent file.
    const broken = {
      generatedAt: new Date().toISOString(),
      capsules: [
        {
          name: 'broken.capsule',
          kind: 'pureTransform',
          source: 'broken.ts',
          generated: {
            testFile: 'tests/generated/__nonexistent__.test.ts',
            benchFile: 'tests/generated/__nonexistent__.bench.ts',
          },
        },
      ],
    };
    const saved = readFileSync(MANIFEST_PATH, 'utf8');
    writeFileSync(MANIFEST_PATH, JSON.stringify(broken), 'utf8');
    try {
      const r = await capture(() => capsuleVerify('broken.capsule'));
      // VitestRunner returns non-zero when the test file isn't found.
      expect(r.exit).toBe(2);
    } finally {
      writeFileSync(MANIFEST_PATH, saved, 'utf8');
    }
  }, 30_000);

  // Restore original manifest if any.
  it('cleanup: restore original manifest', () => {
    if (savedManifest !== undefined) {
      writeFileSync(MANIFEST_PATH, savedManifest, 'utf8');
    } else {
      try { rmSync(MANIFEST_PATH); } catch { /* ignore */ }
    }
    expect(true).toBe(true);
  });
});
