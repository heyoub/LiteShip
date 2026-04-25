import { describe, expect, test } from 'vitest';
import {
  expectedLineEnding,
  findLineEndingViolations,
  parseLineEndingRules,
} from '../../../scripts/check-invariants.ts';

describe('check-invariants script', () => {
  test('parses .gitattributes eol rules in declaration order', () => {
    const rules = parseLineEndingRules('* text=auto eol=lf\n*.ps1 text eol=crlf\n*.png binary\n');

    expect(rules).toEqual([
      { pattern: '*', eol: 'lf' },
      { pattern: '*.ps1', eol: 'crlf' },
      { pattern: '*.png', eol: 'binary' },
    ]);
  });

  test('resolves expected line endings from .gitattributes precedence', () => {
    const rules = parseLineEndingRules('* text=auto eol=lf\n*.ps1 text eol=crlf\n');

    expect(expectedLineEnding('docs/STATUS.md', rules)).toBe('lf');
    expect(expectedLineEnding('scripts/dev.ps1', rules)).toBe('crlf');
  });

  test('repo currently satisfies the declared line-ending policy', () => {
    expect(findLineEndingViolations()).toEqual([]);
  });
});
