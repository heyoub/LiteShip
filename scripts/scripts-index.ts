/**
 * Categorized index of root npm scripts. Reads package.json, groups each
 * script under a category, and prints a human-readable map so newcomers
 * can find what to run without scrolling 60 lines of JSON. Unknown
 * scripts fall into the "other" bucket — fail-loud so the index stays
 * current with the manifest.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CategorySpec {
  readonly name: string;
  readonly description: string;
  readonly scripts: readonly string[];
}

const CATEGORIES: readonly CategorySpec[] = [
  {
    name: 'dev-experience',
    description: 'First-run sugar, doctor, clean. Start here on a fresh clone.',
    scripts: ['setup', 'doctor', 'dev', 'clean', 'scripts', 'glossary', 'fix'],
  },
  {
    name: 'build',
    description: 'Compile the workspace.',
    scripts: ['build', 'typecheck', 'typecheck:scripts', 'typecheck:tests', 'typecheck:spine'],
  },
  {
    name: 'test',
    description: 'Run vitest lanes. `test` is the default fast loop.',
    scripts: [
      'test',
      'test:unit',
      'test:smoke',
      'test:property',
      'test:component',
      'test:integration',
      'test:regression',
      'test:redteam',
      'test:flake',
      'test:e2e',
      'test:e2e:stress',
      'test:e2e:stream-stress',
      'test:vite',
      'test:astro',
      'test:tailwind',
    ],
  },
  {
    name: 'coverage',
    description: 'Coverage lanes — node + browser merge.',
    scripts: [
      'coverage',
      'coverage:node',
      'coverage:node:tracked',
      'coverage:browser',
      'coverage:merge',
      'coverage:unit',
      'coverage:smoke',
      'cover',
    ],
  },
  {
    name: 'bench',
    description: 'Tinybench suites + the bench-gate and trend gate.',
    scripts: ['bench', 'bench:gate', 'bench:trend', 'bench:reality'],
  },
  {
    name: 'lint-format',
    description: 'ESLint + Prettier.',
    scripts: ['lint', 'format', 'format:check', 'check'],
  },
  {
    name: 'audit',
    description: 'Codebase audit lanes — structure, integrity, surface.',
    scripts: ['audit', 'audit:structure', 'audit:integrity', 'audit:surface', 'audit:report'],
  },
  {
    name: 'reports',
    description: 'Verification + reporting scripts.',
    scripts: [
      'report:runtime-seams',
      'report:satellite-scan',
      'feedback:verify',
      'runtime:gate',
      'flex:verify',
      'devx:check',
    ],
  },
  {
    name: 'capsule',
    description: 'Capsule manifest compile + verify.',
    scripts: ['capsule:compile', 'capsule:verify'],
  },
  {
    name: 'release',
    description: 'Ship + verify + gauntlet (the full release-grade gate).',
    scripts: [
      'ship',
      'verify',
      'gauntlet:full',
      'gauntlet:serial',
      'package:smoke',
      'release:notes',
    ],
  },
  {
    name: 'docs',
    description: 'Generate + check docs.',
    scripts: ['docs:build', 'docs:check'],
  },
  {
    name: 'demos',
    description: 'Example workspaces.',
    scripts: ['demo:remotion'],
  },
];

interface Pkg {
  readonly scripts?: Record<string, string>;
}

const pkgPath = resolve(import.meta.dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Pkg;
const all = pkg.scripts ?? {};
const known = new Set<string>();
for (const cat of CATEGORIES) for (const s of cat.scripts) known.add(s);

const widest = Math.max(
  ...Object.keys(all).map((k) => k.length),
  ...CATEGORIES.flatMap((c) => c.scripts.map((s) => s.length)),
);

process.stdout.write('LiteShip — npm scripts\n\n');

for (const cat of CATEGORIES) {
  const present = cat.scripts.filter((s) => s in all);
  if (present.length === 0) continue;
  process.stdout.write(`${cat.name}\n  ${cat.description}\n`);
  for (const s of present) {
    const cmd = all[s] ?? '';
    const truncated = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
    process.stdout.write(`  pnpm ${s.padEnd(widest, ' ')}  ${truncated}\n`);
  }
  process.stdout.write('\n');
}

// Surface uncategorized scripts so the index stays honest as the manifest grows.
const other = Object.keys(all).filter((s) => !known.has(s) && s !== 'prepare' && s !== 'postinstall');
if (other.length > 0) {
  process.stdout.write('other (uncategorized — consider adding to scripts/scripts-index.ts)\n');
  for (const s of other) {
    const cmd = all[s] ?? '';
    const truncated = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
    process.stdout.write(`  pnpm ${s.padEnd(widest, ' ')}  ${truncated}\n`);
  }
  process.stdout.write('\n');
}

process.stdout.write('Tip: `czap help` lists CLI commands, `czap glossary` looks up ontology terms.\n');
