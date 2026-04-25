/**
 * Edge package smoke test.
 */

import { describe, test, expect } from 'vitest';
import { ClientHints, compileTheme } from '@czap/edge';

describe('edge smoke', () => {
  test('ClientHints.parseClientHints handles empty headers', () => {
    const result = ClientHints.parseClientHints(new Headers());
    expect(result).toBeDefined();
  });

  test('compileTheme compiles empty tokens', () => {
    const result = compileTheme({ tokens: {} });
    expect(result.css).toContain(':root');
  });
});
