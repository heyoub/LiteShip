import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

type PackageSpec = {
  readonly dir: string;
  readonly name: string;
  readonly imports: readonly string[];
};

const ROOT = process.cwd();

/** Mirrors every publishable `@czap/*` scope under `packages/*` (see `pnpm-workspace.yaml`). */
const PACKAGES: readonly PackageSpec[] = [
  // _spine is type-only (no runtime); packed and overridden so consumers
  // can resolve `@czap/core`'s and `@czap/scene`'s declared dep on it
  // during `pnpm install`. No runtime `import()` smoke needed.
  { dir: 'packages/_spine', name: '@czap/_spine', imports: [] },
  {
    dir: 'packages/core',
    name: '@czap/core',
    imports: ['@czap/core', '@czap/core/testing', '@czap/core/harness'],
  },
  { dir: 'packages/quantizer', name: '@czap/quantizer', imports: ['@czap/quantizer', '@czap/quantizer/testing'] },
  { dir: 'packages/compiler', name: '@czap/compiler', imports: ['@czap/compiler'] },
  { dir: 'packages/web', name: '@czap/web', imports: ['@czap/web', '@czap/web/lite'] },
  { dir: 'packages/detect', name: '@czap/detect', imports: ['@czap/detect'] },
  { dir: 'packages/edge', name: '@czap/edge', imports: ['@czap/edge'] },
  { dir: 'packages/worker', name: '@czap/worker', imports: ['@czap/worker'] },
  { dir: 'packages/vite', name: '@czap/vite', imports: ['@czap/vite', '@czap/vite/html-transform'] },
  {
    dir: 'packages/astro',
    name: '@czap/astro',
    imports: [
      '@czap/astro',
      '@czap/astro/client-directives/satellite',
      '@czap/astro/client-directives/stream',
      '@czap/astro/client-directives/llm',
      '@czap/astro/client-directives/worker',
      '@czap/astro/client-directives/gpu',
      '@czap/astro/client-directives/wasm',
      '@czap/astro/middleware',
      '@czap/astro/runtime',
    ],
  },
  { dir: 'packages/remotion', name: '@czap/remotion', imports: ['@czap/remotion'] },
  { dir: 'packages/scene', name: '@czap/scene', imports: ['@czap/scene', '@czap/scene/dev'] },
  { dir: 'packages/assets', name: '@czap/assets', imports: ['@czap/assets', '@czap/assets/testing'] },
  { dir: 'packages/cli', name: '@czap/cli', imports: ['@czap/cli'] },
  { dir: 'packages/mcp-server', name: '@czap/mcp-server', imports: ['@czap/mcp-server'] },
];

const PEER_INSTALLS = [
  'effect@4.0.0-beta.32',
  'vite@8.0.0',
  'astro@6.0.0',
  'react@19.2.0',
  'react-dom@19.2.0',
  'remotion@4.0.440',
  'fast-check@4.7.0',
] as const;

function run(command: string, args: readonly string[], cwd: string): string {
  const executable =
    command === 'pnpm' && process.env['npm_execpath']
      ? process.execPath
      : process.platform === 'win32' && command === 'pnpm'
        ? 'pnpm.cmd'
        : command;
  const commandArgs = command === 'pnpm' && process.env['npm_execpath'] ? [process.env['npm_execpath'], ...args] : args;
  return execFileSync(executable, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

async function ensureNoWorkspaceProtocols(consumerDir: string, packageName: string): Promise<void> {
  const packageJsonPath = join(consumerDir, 'node_modules', ...packageName.split('/'), 'package.json');
  const raw = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    const entries = Object.entries(pkg[field] ?? {});
    for (const [dependency, version] of entries) {
      if (version.startsWith('workspace:')) {
        throw new Error(`${packageName} packed metadata still contains workspace protocol for ${dependency}: ${version}`);
      }
    }
  }
}

async function packPackage(cwd: string, tarballDir: string): Promise<string> {
  const before = new Set(await readdir(tarballDir));
  run('pnpm', ['pack', '--pack-destination', tarballDir], cwd);
  const after = await readdir(tarballDir);
  const created = after.filter((entry) => !before.has(entry) && entry.endsWith('.tgz'));
  if (created.length !== 1) {
    throw new Error(`Expected exactly one tarball from ${cwd}, found ${created.length}.`);
  }
  return join(tarballDir, created[0]!);
}

async function main(): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), 'czap-package-smoke-'));
  const tarballDir = join(scratch, 'tarballs');
  const consumerDir = join(scratch, 'consumer');

  await mkdir(tarballDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  try {
    const tarballs: string[] = [];
    const tarballByPackage = new Map<string, string>();

    for (const pkg of PACKAGES) {
      const cwd = resolve(ROOT, pkg.dir);
      const tarball = await packPackage(cwd, tarballDir);
      tarballs.push(tarball);
      tarballByPackage.set(pkg.name, tarball);
    }

    const dependencies = Object.fromEntries([
      ...PACKAGES.map((pkg) => [pkg.name, `file:${tarballByPackage.get(pkg.name)!}`]),
      ...PEER_INSTALLS.map((specifier) => {
        const atIndex = specifier.lastIndexOf('@');
        return [specifier.slice(0, atIndex), specifier.slice(atIndex + 1)];
      }),
    ]);

    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify(
        {
          name: 'czap-package-smoke-consumer',
          private: true,
          type: 'module',
          dependencies,
          pnpm: {
            overrides: Object.fromEntries(PACKAGES.map((pkg) => [pkg.name, `file:${tarballByPackage.get(pkg.name)!}`])),
          },
        },
        null,
        2,
      ),
    );

    run('pnpm', ['install'], consumerDir);

    for (const pkg of PACKAGES) {
      await ensureNoWorkspaceProtocols(consumerDir, pkg.name);
    }

    const smokeModule = `
const imports = ${JSON.stringify(PACKAGES.flatMap((pkg) => pkg.imports), null, 2)};
for (const specifier of imports) {
  const mod = await import(specifier);
  if (!mod || typeof mod !== 'object') {
    throw new Error(\`Import "\${specifier}" did not resolve to a module object.\`);
  }
}
`;
    await writeFile(join(consumerDir, 'smoke.mjs'), smokeModule);
    run('node', ['smoke.mjs'], consumerDir);

    run('pnpm', ['exec', 'czap', 'describe', '--format=json'], consumerDir);

    console.log(`Package smoke passed for ${PACKAGES.length} packages.`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
