/**
 * Consolidated unit tests for cli command modules that share the
 * `reports/capsule-manifest.json` filesystem state. Vitest runs test
 * files in parallel workers; keeping these in a single file ensures
 * they run sequentially in the same worker so races on the manifest
 * file don't corrupt each other.
 *
 * Cross-file note: `tests/integration/capsule-compile.test.ts` also reads
 * this manifest. Tests that replace it with broken entries must restore
 * the prior bytes in `afterEach`, or another worker can observe poisoned
 * JSON for the full `capsule verify` timeout window.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { run } from '../../../packages/cli/src/dispatch.js';
import { capsuleInspect, capsuleList, capsuleVerify } from '../../../packages/cli/src/commands/capsule.js';
import { assetAnalyze } from '../../../packages/cli/src/commands/asset-analyze.js';
import { assetVerify } from '../../../packages/cli/src/commands/asset-verify.js';
import { sceneVerify } from '../../../packages/cli/src/commands/scene-verify.js';

interface CaptureResult {
  exit: number;
  stdout: string;
  stderr: string;
}

async function capture(fn: () => Promise<number>): Promise<CaptureResult> {
  let stdout = '';
  let stderr = '';
  const origO = process.stdout.write.bind(process.stdout);
  const origE = process.stderr.write.bind(process.stderr);
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
    (process.stdout as unknown as { write: typeof origO }).write = origO;
    (process.stderr as unknown as { write: typeof origE }).write = origE;
  }
}

const MANIFEST_PATH = 'reports/capsule-manifest.json';

const FIXTURE_MANIFEST = {
  generatedAt: '2026-04-25T00:00:00.000Z',
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
  ],
};

let savedManifest: string | undefined;
/** Bytes on disk immediately before each `beforeEach` — restored in `afterEach` for other workers. */
let manifestSnapBeforeEach: string | undefined;

describe('cli — manifest-dependent commands (serialized)', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) savedManifest = readFileSync(MANIFEST_PATH, 'utf8');
  });
  beforeEach(() => {
    manifestSnapBeforeEach = existsSync(MANIFEST_PATH)
      ? readFileSync(MANIFEST_PATH, 'utf8')
      : undefined;
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, JSON.stringify(FIXTURE_MANIFEST), 'utf8');
    if (existsSync('.czap/cache')) rmSync('.czap/cache', { recursive: true, force: true });
  });
  afterEach(() => {
    const restore = manifestSnapBeforeEach ?? savedManifest;
    if (restore !== undefined) {
      mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
      writeFileSync(MANIFEST_PATH, restore, 'utf8');
    } else if (existsSync(MANIFEST_PATH)) {
      rmSync(MANIFEST_PATH);
    }
  });
  afterAll(() => {
    if (savedManifest !== undefined) writeFileSync(MANIFEST_PATH, savedManifest, 'utf8');
    else if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
  });

  // ---------- capsule inspect / list / verify ----------

  it('capsule inspect dumps a manifest entry by name', async () => {
    const r = await capture(() => capsuleInspect('core.canonical-cbor'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.capsule.name).toBe('core.canonical-cbor');
  });

  it('capsule inspect exits 1 for an unknown id', async () => {
    const r = await capture(() => capsuleInspect('not-a-real-capsule'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not found/);
  });

  it('capsule inspect exits 1 when manifest is missing', async () => {
    rmSync(MANIFEST_PATH);
    const r = await capture(() => capsuleInspect('any'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/manifest missing/);
  });

  it('capsule list returns all capsules by default', async () => {
    const r = await capture(() => capsuleList(undefined));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.capsules.length).toBeGreaterThanOrEqual(2);
  });

  it('capsule list --kind filters by assembly kind', async () => {
    const r = await capture(() => capsuleList('pureTransform'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.capsules.every((c: { kind: string }) => c.kind === 'pureTransform')).toBe(true);
  });

  it('capsule list exits 1 when manifest is missing', async () => {
    rmSync(MANIFEST_PATH);
    const r = await capture(() => capsuleList(undefined));
    expect(r.exit).toBe(1);
  });

  it('capsule verify exits 1 for unknown id', async () => {
    const r = await capture(() => capsuleVerify('not-a-real-capsule'));
    expect(r.exit).toBe(1);
  });

  it('capsule verify exits 1 when manifest is missing', async () => {
    rmSync(MANIFEST_PATH);
    const r = await capture(() => capsuleVerify('any'));
    expect(r.exit).toBe(1);
  });

  it('capsule verify reports failure when generated test is missing', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({
        generatedAt: '2026-04-25T00:00:00.000Z',
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
      }),
      'utf8',
    );
    const r = await capture(() => capsuleVerify('broken.capsule'));
    expect(r.exit).toBe(2);
  }, 30_000);

  // ---------- asset analyze ----------

  it('asset analyze exits 1 when manifest missing', async () => {
    rmSync(MANIFEST_PATH);
    const r = await capture(() => assetAnalyze('intro-bed', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/manifest missing/);
  });

  it('asset analyze exits 1 when asset id is unknown', async () => {
    const r = await capture(() => assetAnalyze('not-an-asset', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not registered/);
  });

  it('asset analyze exits 1 when source file is not on disk', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({
        generatedAt: '2026-04-25T00:00:00.000Z',
        capsules: [
          { name: 'phantom-asset', kind: 'cachedProjection', source: 'examples/scenes/phantom.wav', generated: { testFile: 't', benchFile: 'b' } },
        ],
      }),
      'utf8',
    );
    const r = await capture(() => assetAnalyze('phantom-asset', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/source file not found/);
  });

  // ---------- asset verify ----------

  it('asset verify exits 1 when manifest is missing', async () => {
    rmSync(MANIFEST_PATH);
    const r = await capture(() => assetVerify('intro-bed'));
    expect(r.exit).toBe(1);
  });

  it('asset verify exits 1 when asset is unknown', async () => {
    const r = await capture(() => assetVerify('not-an-asset'));
    expect(r.exit).toBe(1);
  });

  it('asset verify exits 0 with invariantsChecked=0 when generated test is absent', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({
        generatedAt: '2026-04-25T00:00:00.000Z',
        capsules: [
          {
            name: 'no-tests-asset',
            kind: 'cachedProjection',
            source: 'fake.ts',
            generated: { testFile: 'tests/generated/__never_exists__.test.ts', benchFile: 'tests/generated/__never_exists__.bench.ts' },
          },
        ],
      }),
      'utf8',
    );
    const r = await capture(() => assetVerify('no-tests-asset'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.invariantsChecked).toBe(0);
  });

  // ---------- scene verify ----------

  it('scene verify exits 1 when scene file does not exist', async () => {
    const r = await capture(() => sceneVerify('does/not/exist.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/scene not found/);
  });

  it('scene verify exits 1 when scene module does not export a sceneComposition capsule', async () => {
    const r = await capture(() => sceneVerify('tests/fixtures/scene/empty-module.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/no sceneComposition capsule exported/);
  });

  it('scene verify exits 1 when capsule is not in manifest', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ generatedAt: '2026-04-25T00:00:00.000Z', capsules: [] }),
      'utf8',
    );
    const r = await capture(() => sceneVerify('tests/fixtures/scene/throwing-compile.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not in manifest/);
  });

  // ---------- dispatch (exercises the run() router branches) ----------

  it('run: unknown command → exit 1, structured stderr', async () => {
    const r = await capture(() => run(['no-such-command']));
    expect(r.exit).toBe(1);
    const err = JSON.parse(r.stderr.trim().split('\n').pop()!);
    expect(err.error).toBe('unknown_command');
  });

  it('run: unknown scene subcommand → exit 1', async () => {
    const r = await capture(() => run(['scene', 'no-sub']));
    expect(r.exit).toBe(1);
  });

  it('run: scene with no subcommand → exit 1 with "missing"', async () => {
    const r = await capture(() => run(['scene']));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/missing/);
  });

  it('run: unknown asset subcommand → exit 1', async () => {
    const r = await capture(() => run(['asset', 'no-sub']));
    expect(r.exit).toBe(1);
  });

  it('run: asset analyze without --projection → exit 1', async () => {
    const r = await capture(() => run(['asset', 'analyze', 'something']));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/missing --projection/);
  });

  it('run: unknown capsule subcommand → exit 1', async () => {
    const r = await capture(() => run(['capsule', 'no-sub']));
    expect(r.exit).toBe(1);
  });

  it('run: describe → JSON envelope with assemblyKinds + commands', async () => {
    const r = await capture(() => run(['describe']));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(Array.isArray(receipt.assemblyKinds)).toBe(true);
  });

  it('run: describe --format=mcp → tools envelope', async () => {
    const r = await capture(() => run(['describe', '--format=mcp']));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(Array.isArray(receipt.tools)).toBe(true);
  });

  it('run: capsule list with default manifest', async () => {
    const r = await capture(() => run(['capsule', 'list']));
    expect(r.exit).toBe(0);
  });

  it('run: capsule list --kind=pureTransform filter', async () => {
    const r = await capture(() => run(['capsule', 'list', '--kind=pureTransform']));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.kind).toBe('pureTransform');
  });

  it('run: gauntlet --dry-run → phase list receipt', async () => {
    const r = await capture(() => run(['gauntlet', '--dry-run']));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.dryRun).toBe(true);
    expect(Array.isArray(receipt.phases)).toBe(true);
  });
});
