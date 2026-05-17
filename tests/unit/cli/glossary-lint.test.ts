/**
 * Glossary-lint: every maritime register term used in CLI user-facing
 * source must be defined in both `czap glossary` (in-CLI ENTRIES) and
 * `docs/GLOSSARY.md` (the documented register). This is the load-bearing
 * drift-guard for the ontology — if someone adds "Stow the cargo" to a
 * doctor hint but forgets to add "cargo" to the glossary, this test
 * fails.
 *
 * The list of terms to enforce lives in this test (single source of
 * truth for what counts as a "maritime register term"). When you add a
 * new term to a CLI string, add it here AND to GLOSSARY.md AND to the
 * `czap glossary` ENTRIES array.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { glossary } from '../../../packages/cli/src/commands/glossary.js';
import { captureCli } from '../../integration/cli/capture.js';

const REPO_ROOT = resolve(__dirname, '../../..');
const CLI_SRC = resolve(REPO_ROOT, 'packages/cli/src');
const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');
const GLOSSARY_MD = resolve(REPO_ROOT, 'docs/GLOSSARY.md');

/**
 * Maritime register the CLI surface uses. Each entry is a `{term, regex}`
 * pair — the regex is what we look for in source strings. Adding a new
 * register term here is the deliberate gating step: if you add the term
 * here, you must also add it to GLOSSARY.md and to `czap glossary`.
 */
const MARITIME_TERMS: ReadonlyArray<{ term: string; pattern: RegExp }> = [
  { term: 'hull', pattern: /\b[Hh]ull\b/ },
  { term: 'keel', pattern: /\b[Kk]eel\b/ },
  { term: 'cast off', pattern: /\b[Cc]ast off\b/ },
  { term: 'moored', pattern: /\b[Mm]oored\b/ },
  { term: 'shake-down', pattern: /\b[Ss]hake[- ]?down\b|\bshakedown\b/ },
  { term: 'dry-dock', pattern: /\b[Dd]ry[- ]?dock\b/ },
  { term: 'deck plan', pattern: /\b[Dd]eck plan\b/ },
  { term: 'chart', pattern: /\bthe chart\b/ },
  { term: 'rig', pattern: /\b[Rr]ig (?:the|it|in)\b/ },
  { term: 'stow', pattern: /\b[Ss]tow\b/ },
  { term: 'bearing', pattern: /\b[Bb]earing\b/ },
  { term: 'quay', pattern: /\b[Qq]uay\b/ },
];

function walk(dir: string, ext: readonly string[] = ['.ts', '.mjs', '.sh']): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, ext));
    } else if (ext.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function collectCliSurfaceContent(): string {
  const files = [...walk(CLI_SRC), ...walk(SCRIPTS_DIR)];
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

describe('glossary lint', () => {
  const cliContent = collectCliSurfaceContent();
  const glossaryMd = readFileSync(GLOSSARY_MD, 'utf8');

  it('every maritime term used in CLI source is defined in docs/GLOSSARY.md', () => {
    const missing: string[] = [];
    for (const { term, pattern } of MARITIME_TERMS) {
      if (!pattern.test(cliContent)) continue;
      const docPattern = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (!docPattern.test(glossaryMd)) missing.push(term);
    }
    expect(missing, `terms used in CLI source but missing from docs/GLOSSARY.md: ${missing.join(', ')}`).toEqual([]);
  });

  it('every maritime term used in CLI source resolves to ≥1 entry in `czap glossary`', async () => {
    const missing: string[] = [];
    for (const { term, pattern } of MARITIME_TERMS) {
      if (!pattern.test(cliContent)) continue;
      const { stdout } = await captureCli(() => glossary(term, { pretty: false }));
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      if (receipt.status !== 'ok' || receipt.entries.length === 0) missing.push(term);
    }
    expect(missing, `terms used in CLI source but no match in \`czap glossary\`: ${missing.join(', ')}`).toEqual([]);
  });

  it('the MARITIME_TERMS list itself is non-empty (sanity check)', () => {
    expect(MARITIME_TERMS.length).toBeGreaterThan(5);
  });
});
