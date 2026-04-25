import { describe, expect, test } from 'vitest';
import { applyCzapHeaders, CLIENT_HINTS_HEADERS, CROSS_ORIGIN_HEADERS, getCzapHeaderEntries } from '../../../packages/astro/src/headers.js';

describe('astro header helpers', () => {
  test('omits empty client hint override values while preserving worker headers', () => {
    const entries = getCzapHeaderEntries({
      detectEnabled: true,
      workersEnabled: true,
      acceptCH: '',
      criticalCH: '',
    });

    expect(entries).toEqual(Object.entries(CROSS_ORIGIN_HEADERS));
  });

  test('uses default client hint headers when detection is enabled without overrides', () => {
    const entries = getCzapHeaderEntries({
      detectEnabled: true,
      workersEnabled: false,
    });

    expect(entries).toEqual([
      ['Accept-CH', CLIENT_HINTS_HEADERS['Accept-CH']!],
      ['Critical-CH', CLIENT_HINTS_HEADERS['Critical-CH']!],
    ]);
  });

  test('applyCzapHeaders mutates and returns the provided Headers instance', () => {
    const headers = new Headers({ 'x-test': 'keep' });
    const result = applyCzapHeaders(headers, {
      detectEnabled: false,
      workersEnabled: true,
    });

    expect(result).toBe(headers);
    expect(headers.get('x-test')).toBe('keep');
    expect(headers.get('Accept-CH')).toBeNull();
    expect(headers.get('Critical-CH')).toBeNull();
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe(CROSS_ORIGIN_HEADERS['Cross-Origin-Opener-Policy']);
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe(CROSS_ORIGIN_HEADERS['Cross-Origin-Embedder-Policy']);
  });
});
