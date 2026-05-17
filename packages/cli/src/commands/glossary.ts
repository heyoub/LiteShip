/**
 * glossary — terminal access to the LiteShip prose register. Mirrors
 * docs/GLOSSARY.md so contributors and AI agents can look a term up
 * without leaving the shell. Emits JSON; pretty TTY summary on stderr.
 *
 * @module
 */

import { color, colorEnabled } from '../lib/ansi.js';
import { emit, emitError } from '../receipts.js';

/** One ontology term. Mirrors a row in docs/GLOSSARY.md. */
export interface GlossaryEntry {
  readonly term: string;
  readonly category: 'naming' | 'primitive' | 'translator-note';
  readonly definition: string;
  readonly seeAlso?: readonly string[];
}

const ENTRIES: readonly GlossaryEntry[] = [
  {
    term: 'LiteShip',
    category: 'naming',
    definition:
      'Product and distribution layer. Use this name in READMEs, social posts, and anywhere a reader adopts the framework.',
    seeAlso: ['CZAP', '@czap/*'],
  },
  {
    term: 'CZAP',
    category: 'naming',
    definition:
      'Engine name (Content-Zoned Adaptive Projection, "see-zap"). Use this in architecture docs, ADRs, and when describing how projection and zones work.',
    seeAlso: ['LiteShip', 'cast'],
  },
  {
    term: '@czap/*',
    category: 'naming',
    definition: 'npm namespace. Used in install lines, imports, and package lists. Never renamed in prose.',
    seeAlso: ['LiteShip', 'CZAP'],
  },
  {
    term: 'boundary',
    category: 'primitive',
    definition:
      'Where a continuous signal partitions into named bearings. Verb register: rig, tension, set. Avoid "wire" for boundaries in prose.',
    seeAlso: ['bearing', 'rig', 'signal'],
  },
  {
    term: 'token',
    category: 'primitive',
    definition: 'A material of the design language: axes, fallbacks, craft vocabulary.',
    seeAlso: ['theme', 'style'],
  },
  {
    term: 'style',
    category: 'primitive',
    definition: "A named-state output: what casts or projects when a boundary's bearing changes.",
    seeAlso: ['boundary', 'cast', 'theme'],
  },
  {
    term: 'theme',
    category: 'primitive',
    definition: 'Coordinated variants: how materials re-trim when the presentation mode shifts.',
    seeAlso: ['token', 'style'],
  },
  {
    term: 'cast',
    category: 'translator-note',
    definition:
      'Verb only — project a definition into a target output surface (CSS, GLSL, ARIA, etc.). Always carries a target. Not theatrical-cast, not type-coercion.',
    seeAlso: ['surface', 'compile path'],
  },
  {
    term: 'rig',
    category: 'translator-note',
    definition:
      'Both verb ("rig a boundary") and noun ("the rig is in between"). The system that ties continuous signals to named bearings.',
    seeAlso: ['boundary'],
  },
  {
    term: 'surface',
    category: 'translator-note',
    definition: 'Noun — a runtime target the compiler emits to (CSS surface, ARIA surface). Not the verb sense.',
    seeAlso: ['cast', 'compile path'],
  },
  {
    term: 'bearing',
    category: 'translator-note',
    definition: 'Noun — a named discrete state a boundary partitions to (one of mobile/tablet/desktop, etc.).',
    seeAlso: ['boundary'],
  },
  {
    term: 'trim',
    category: 'translator-note',
    definition: 'Runtime-cost language. "Kept the working deck trim" = "kept the runtime cost low".',
    seeAlso: ['hot path'],
  },
  {
    term: 'hot path',
    category: 'primitive',
    definition:
      'Working deck / working line. Per-tick code that allocates nothing on the steady-state. See ADR-0002 for the pool / dirty-flag / dense-ECS discipline.',
    seeAlso: ['trim'],
  },
  {
    term: 'compile path',
    category: 'primitive',
    definition: 'Cast to CSS, project to GLSL / WGSL / ARIA / AI. Prefer a register verb to "compile" in casual prose.',
    seeAlso: ['cast', 'surface'],
  },
  {
    term: 'capsule',
    category: 'primitive',
    definition:
      'Content-addressed unit of dispatch (ADR-0008). Seven assembly kinds: pureTransform, receiptedMutation, stateMachine, siteAdapter, policyGate, cachedProjection, sceneComposition.',
    seeAlso: ['receipt'],
  },
  {
    term: 'receipt',
    category: 'primitive',
    definition:
      'JSON record emitted by a CLI command or capsule run. Status, command, timestamp, plus command-specific fields.',
    seeAlso: ['capsule'],
  },
  {
    term: 'gauntlet',
    category: 'primitive',
    definition:
      'The full release-grade test gate (`pnpm run gauntlet:full`). Thirty-two phases ending in `flex:verify PASSED — project is 10/10`.',
  },
  {
    term: 'shake-down',
    category: 'translator-note',
    definition:
      'The first-run aggregate (`pnpm setup`). Run on a new hull before sailing — install, build, smoke test.',
  },
  {
    term: 'dry-dock',
    category: 'translator-note',
    definition:
      'Clean state. `pnpm clean` wipes dist/, coverage/, reports/, .tsbuildinfo so the next build starts from a known empty deck.',
  },
  {
    term: 'hull',
    category: 'translator-note',
    definition:
      'The built `dist/` artifact of a package. "Hull not yet laid" = no dist/ on disk; "Hull check" = the rolled-up status emitted by `czap doctor`.',
    seeAlso: ['keel', 'shake-down'],
  },
  {
    term: 'keel',
    category: 'translator-note',
    definition:
      '`tsc --build` output. "Lay the keel" = run `pnpm run build`. The first thing you put down before anything else floats.',
    seeAlso: ['hull'],
  },
  {
    term: 'cast off',
    category: 'translator-note',
    definition:
      'Begin the run: leave the dock. Used for first actions after install ("Cast off with: pnpm setup") and for non-blocking states ("you can cast off") in `czap doctor`.',
    seeAlso: ['moored'],
  },
  {
    term: 'moored',
    category: 'translator-note',
    definition:
      'Installed but not yet underway. The state immediately after `pnpm install` — node_modules present, but build/test not run. Postinstall says "LiteShip — moored."',
    seeAlso: ['cast off', 'shake-down'],
  },
  {
    term: 'deck plan',
    category: 'translator-note',
    definition:
      'The npm-scripts catalogue (`pnpm scripts`). Lists every script grouped by purpose. The chart for inner-loop operations.',
    seeAlso: ['chart'],
  },
  {
    term: 'chart',
    category: 'translator-note',
    definition: 'The verb table (`czap help`). The map of CLI bearings — what verb does what, grouped by phase.',
    seeAlso: ['deck plan'],
  },
  {
    term: 'quay',
    category: 'translator-note',
    definition:
      'The release surface. Where a package ties up before being shipped to npm. "Tied up at the quay" = the package is packed and the capsule is written, awaiting `npm publish`. Used in `czap help` "Ship out (quay-side, release)" and in the release-flow hint.',
    seeAlso: ['gauntlet'],
  },
  {
    term: 'rig (verb)',
    category: 'translator-note',
    definition:
      'Install or wire a piece of infrastructure into place. "Rig the pre-commit hook" = link `.git/hooks/pre-commit`. Distinct from the noun "rig" (the boundary system).',
    seeAlso: ['rig'],
  },
  {
    term: 'stow',
    category: 'translator-note',
    definition:
      'Pack a downloaded artifact into its expected location. "Stow the browsers" = `pnpm exec playwright install`. "Stow Rust" = install via rustup.',
  },
] as const;

/** Receipt shape emitted by `czap glossary`. */
export interface GlossaryReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: 'glossary';
  readonly timestamp: string;
  readonly term: string | null;
  readonly entries: readonly GlossaryEntry[];
}

function matchEntries(query: string | null): readonly GlossaryEntry[] {
  if (!query) return ENTRIES;
  const q = query.toLowerCase();
  // Exact term match wins; fall through to substring otherwise.
  const exact = ENTRIES.filter((e) => e.term.toLowerCase() === q);
  if (exact.length > 0) return exact;
  return ENTRIES.filter((e) => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q));
}

function prettyEntry(e: GlossaryEntry, on: boolean): string {
  const head = `${color('cyan', e.term, on)}  ${color('dim', `(${e.category})`, on)}`;
  const body = e.definition;
  const seeAlso =
    e.seeAlso && e.seeAlso.length > 0
      ? `  ${color('dim', 'see also:', on)} ${e.seeAlso.map((s) => color('cyan', s, on)).join(', ')}\n`
      : '';
  return `${head}\n  ${body}\n${seeAlso}`;
}

/** Execute the glossary command. */
export async function glossary(term: string | null, opts: { pretty?: boolean } = {}): Promise<number> {
  const entries = matchEntries(term);
  if (entries.length === 0) {
    emitError('glossary', `no entry for: ${term ?? '<missing>'}`);
    process.stderr.write(
      `Try one of: ${ENTRIES.map((e) => e.term)
        .slice(0, 8)
        .join(', ')} ...\n`,
    );
    return 1;
  }
  const receipt: GlossaryReceipt = {
    status: 'ok',
    command: 'glossary',
    timestamp: new Date().toISOString(),
    term,
    entries,
  };
  emit(receipt);

  const wantPretty = opts.pretty ?? Boolean(process.stderr.isTTY);
  if (wantPretty) {
    const on = colorEnabled();
    process.stderr.write('\n');
    for (const e of entries) process.stderr.write(prettyEntry(e, on) + '\n');
  }
  return 0;
}

/** Exported for tests so they can introspect the catalog without re-running. */
export const GLOSSARY_ENTRIES = ENTRIES;
