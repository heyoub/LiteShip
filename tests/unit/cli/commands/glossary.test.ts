/**
 * Unit tests for `czap glossary`. The catalog mirrors docs/GLOSSARY.md;
 * we check shape + a few canonical terms so a future refactor of the
 * entries can't silently lose them.
 */
import { describe, it, expect } from 'vitest';
import { glossary, GLOSSARY_ENTRIES } from '../../../../packages/cli/src/commands/glossary.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('glossary command', () => {
  it('returns the full catalog when no term is given', async () => {
    const { exit, stdout } = await captureCli(() => glossary(null, { pretty: false }));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('glossary');
    expect(receipt.status).toBe('ok');
    expect(receipt.term).toBeNull();
    expect(receipt.entries.length).toBe(GLOSSARY_ENTRIES.length);
  });

  it('matches an exact term', async () => {
    const { exit, stdout } = await captureCli(() => glossary('boundary', { pretty: false }));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.entries.length).toBe(1);
    expect(receipt.entries[0].term).toBe('boundary');
  });

  it('substring-matches when no exact hit', async () => {
    const { exit, stdout } = await captureCli(() => glossary('rig', { pretty: false }));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.entries.length).toBeGreaterThan(0);
  });

  it('exits 1 on an unknown term', async () => {
    const { exit, stderr } = await captureCli(() => glossary('this-term-does-not-exist', { pretty: false }));
    expect(exit).toBe(1);
    expect(stderr).toContain('no entry for');
  });

  it('catalog includes the load-bearing ontology terms', () => {
    const terms = new Set(GLOSSARY_ENTRIES.map((e) => e.term));
    for (const required of ['LiteShip', 'CZAP', '@czap/*', 'boundary', 'cast', 'rig', 'bearing', 'capsule', 'gauntlet']) {
      expect(terms).toContain(required);
    }
  });

  it('every entry has a non-empty definition', () => {
    for (const e of GLOSSARY_ENTRIES) {
      expect(e.term.length).toBeGreaterThan(0);
      expect(e.definition.length).toBeGreaterThan(10);
      expect(['naming', 'primitive', 'translator-note']).toContain(e.category);
    }
  });

  it('pretty mode emits formatted entries on stderr (covers prettyEntry: header + body + seeAlso line)', async () => {
    const { exit, stderr } = await captureCli(() => glossary('boundary', { pretty: true }));
    expect(exit).toBe(0);
    // boundary has a definition and seeAlso list — exercises both the body
    // branch and the seeAlso-non-empty arm of the prettyEntry ternary.
    expect(stderr).toContain('boundary');
    expect(stderr).toContain('(primitive)');
    expect(stderr).toContain('see also:');
    expect(stderr).toContain('bearing');
  });

  it('pretty mode handles an entry without seeAlso (covers the empty-seeAlso arm)', async () => {
    // `gauntlet` has no seeAlso field — exercises the ternary's empty arm
    // so prettyEntry's `seeAlso=''` path is hit at least once.
    const { exit, stderr } = await captureCli(() => glossary('gauntlet', { pretty: true }));
    expect(exit).toBe(0);
    expect(stderr).toContain('gauntlet');
    // No 'see also:' line for this entry.
    const gauntletBlock = stderr.split('\n').slice(stderr.split('\n').findIndex((l) => l.includes('gauntlet'))).join('\n');
    expect(gauntletBlock).not.toContain('see also:');
  });
});
