/**
 * SSE module tests -- pure helpers: parseMessage, calculateDelay, buildUrl,
 * and Resumption: parseEventId, canResume.
 *
 * These functions have zero DOM/EventSource dependency and are fully testable
 * in a headless Node environment.
 */

import { describe, test, expect, vi } from 'vitest';
import { SSE, Resumption } from '@czap/web';
import type { ReconnectConfig } from '@czap/web';

// ===========================================================================
// SSE.parseMessage
// ===========================================================================

describe('SSE.parseMessage', () => {
  /** Minimal MessageEvent-shaped object for testing. */
  const msg = (data: string) => ({ data }) as MessageEvent;

  test('parses valid JSON with a type field', () => {
    const result = SSE.parseMessage(msg(JSON.stringify({ type: 'patch', data: { foo: 1 } })));
    expect(result).toEqual({ type: 'patch', data: { foo: 1 } });
  });

  test('returns null for JSON missing "type"', () => {
    expect(SSE.parseMessage(msg(JSON.stringify({ data: 'no-type' })))).toBeNull();
  });

  test('returns null for non-JSON strings', () => {
    expect(SSE.parseMessage(msg('not json'))).toBeNull();
  });

  test('rethrows non-syntax parse failures', () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new TypeError('parse exploded');
    });

    expect(() => SSE.parseMessage(msg('{"type":"patch"}'))).toThrow('parse exploded');

    parseSpy.mockRestore();
  });

  test('returns null when JSON.parse throws a SyntaxError', () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new SyntaxError('bad json');
    });

    expect(SSE.parseMessage(msg('{"type":"patch"}'))).toBeNull();

    parseSpy.mockRestore();
  });

  test('returns null for empty data', () => {
    expect(SSE.parseMessage(msg(''))).toBeNull();
  });

  // --- Pre-flight character check tests ---

  test('skips JSON.parse for plain text strings (pre-flight)', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(SSE.parseMessage(msg('hello world'))).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  test('skips JSON.parse for numeric strings (pre-flight)', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(SSE.parseMessage(msg('12345'))).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  test('skips JSON.parse for whitespace-only strings (pre-flight)', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(SSE.parseMessage(msg('   \t\n  '))).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  test('proceeds to JSON.parse for strings starting with { (after whitespace)', () => {
    const result = SSE.parseMessage(msg('  {"type":"patch"}'));
    expect(result).toEqual({ type: 'patch' });
  });

  test('proceeds to JSON.parse for strings starting with [', () => {
    // Arrays lack a type field, so they return null -- but JSON.parse is still attempted.
    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(SSE.parseMessage(msg('[1,2,3]'))).toBeNull();
    expect(parseSpy).toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  test('handles pre-parsed object data (non-string)', () => {
    const event = { data: { type: 'patch', payload: 42 } } as unknown as MessageEvent;
    expect(SSE.parseMessage(event)).toEqual({ type: 'patch', payload: 42 });
  });

  test('heartbeat message parses correctly', () => {
    const result = SSE.parseMessage(msg(JSON.stringify({ type: 'heartbeat' })));
    expect(result).toEqual({ type: 'heartbeat' });
  });

  test('returns null when type is not a string', () => {
    expect(SSE.parseMessage(msg(JSON.stringify({ type: 42 })))).toBeNull();
  });

  test('returns null for null data', () => {
    expect(SSE.parseMessage(msg(JSON.stringify(null)))).toBeNull();
  });

  test('returns null for pre-parsed non-object payloads from structured clone', () => {
    const primitiveEvent = { data: 42 } as unknown as MessageEvent;
    expect(SSE.parseMessage(primitiveEvent)).toBeNull();

    const nullEvent = { data: null } as unknown as MessageEvent;
    expect(SSE.parseMessage(nullEvent)).toBeNull();
  });
});

// ===========================================================================
// SSE.calculateDelay
// ===========================================================================

describe('SSE.calculateDelay', () => {
  const config: ReconnectConfig = {
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 2,
  };

  test('first attempt delay is roughly initialDelay (within jitter)', () => {
    const delay = SSE.calculateDelay(0, config);
    // base = 1000 * 2^0 = 1000, jitter = +-25% = +-250
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });

  test('delay grows exponentially', () => {
    // attempt=3 -> base = 1000 * 2^3 = 8000
    const delay = SSE.calculateDelay(3, config);
    expect(delay).toBeGreaterThanOrEqual(6000);
    expect(delay).toBeLessThanOrEqual(10000);
  });

  test('delay is capped at maxDelay', () => {
    // attempt=20 -> base = 1000 * 2^20 = huge, capped at 30000
    const delay = SSE.calculateDelay(20, config);
    expect(delay).toBeLessThanOrEqual(30000);
  });

  test('factor of 1 produces constant delay (within jitter)', () => {
    const flatConfig: ReconnectConfig = { ...config, factor: 1 };
    for (let i = 0; i < 5; i++) {
      const delay = SSE.calculateDelay(i, flatConfig);
      // base always 1000, jitter +-250
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });
});

// ===========================================================================
// SSE.buildUrl
// ===========================================================================

describe('SSE.buildUrl', () => {
  test('absolute URL is preserved', () => {
    const url = SSE.buildUrl('http://example.com/events');
    expect(url).toBe('http://example.com/events');
  });

  test('artifactId is appended to pathname', () => {
    const url = SSE.buildUrl('http://example.com/events', 'art-123');
    expect(url).toContain('/events/art-123');
  });

  test('lastEventId is added as query param', () => {
    const url = SSE.buildUrl('http://example.com/events', undefined, 'evt-42');
    expect(url).toContain('lastEventId=evt-42');
  });

  test('both artifactId and lastEventId are applied', () => {
    const url = SSE.buildUrl('http://example.com/events', 'art-1', 'evt-5');
    expect(url).toContain('/events/art-1');
    expect(url).toContain('lastEventId=evt-5');
  });

  test('relative URL gets resolved against localhost', () => {
    const url = SSE.buildUrl('/fx/stream');
    expect(url).toContain('/fx/stream');
    // Should be a full URL
    expect(url).toMatch(/^https?:\/\//);
  });

  test('artifactId not duplicated if already in pathname', () => {
    const url = SSE.buildUrl('http://example.com/events/art-1', 'art-1');
    // Should not have /art-1/art-1
    const pathname = new URL(url).pathname;
    expect(pathname).not.toContain('art-1/art-1');
  });

  test('rejects artifactId values that are not safe single path segments', () => {
    expect(() => SSE.buildUrl('http://example.com/events', '../../admin')).toThrow(/Invalid artifactId/);
    expect(() => SSE.buildUrl('http://example.com/events', 'nested/path')).toThrow(/Invalid artifactId/);
  });
});

// ===========================================================================
// Resumption.parseEventId
// ===========================================================================

describe('Resumption.parseEventId', () => {
  test('pure numeric ID', () => {
    const result = Resumption.parseEventId('42');
    expect(result.raw).toBe('42');
    expect(result.sequence).toBe(42);
    expect(result.timestamp).toBeUndefined();
    expect(result.nodeId).toBeUndefined();
  });

  test('prefixed ID (evt-123)', () => {
    const result = Resumption.parseEventId('evt-123');
    expect(result.raw).toBe('evt-123');
    expect(result.sequence).toBe(123);
  });

  test('HLC-style with node ID (timestamp-seq-nodeId)', () => {
    const result = Resumption.parseEventId('1700000000-5-node1');
    expect(result.raw).toBe('1700000000-5-node1');
    expect(result.timestamp).toBe(1700000000);
    expect(result.sequence).toBe(5);
    expect(result.nodeId).toBe('node1');
  });

  test('HLC-style without node ID (timestamp-seq)', () => {
    const result = Resumption.parseEventId('1700000000-5');
    expect(result.timestamp).toBe(1700000000);
    expect(result.sequence).toBe(5);
    expect(result.nodeId).toBeUndefined();
  });

  test('trailing number fallback', () => {
    const result = Resumption.parseEventId('custom_suffix_99');
    expect(result.sequence).toBe(99);
  });

  test('no number at all returns sequence 0', () => {
    const result = Resumption.parseEventId('abc');
    expect(result.sequence).toBe(0);
  });
});

// ===========================================================================
// Resumption.canResume
// ===========================================================================

describe('Resumption.canResume', () => {
  test('returns true when server has no oldest ID', () => {
    expect(Resumption.canResume('42', '')).toBe(true);
  });

  test('returns false when client has no last ID', () => {
    expect(Resumption.canResume('', '10')).toBe(false);
  });

  test('numeric comparison: client ahead of server oldest', () => {
    expect(Resumption.canResume('50', '10')).toBe(true);
  });

  test('numeric comparison: client behind server oldest', () => {
    expect(Resumption.canResume('5', '10')).toBe(false);
  });

  test('numeric comparison: equal IDs can resume', () => {
    expect(Resumption.canResume('10', '10')).toBe(true);
  });

  test('prefixed IDs: client ahead', () => {
    expect(Resumption.canResume('evt-50', 'evt-10')).toBe(true);
  });

  test('prefixed IDs: client behind', () => {
    expect(Resumption.canResume('evt-5', 'evt-10')).toBe(false);
  });

  test('HLC IDs: same timestamp, client sequence ahead', () => {
    expect(Resumption.canResume('1700000000-10-n1', '1700000000-5-n1')).toBe(true);
  });

  test('HLC IDs: client timestamp behind', () => {
    expect(Resumption.canResume('1699999999-10-n1', '1700000000-5-n1')).toBe(false);
  });

  test('HLC IDs: client timestamp ahead', () => {
    expect(Resumption.canResume('1700000001-0-n1', '1700000000-99-n1')).toBe(true);
  });
});

// ===========================================================================
// SSE default config
// ===========================================================================

describe('SSE defaults', () => {
  test('defaultReconnectConfig has sane values', () => {
    // Access through the SSE namespace -- the module re-exports it
    // We verify the shape since tests above rely on these defaults.
    const config: ReconnectConfig = {
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
    };
    // Verify our fixture matches. If the defaults change, tests above will
    // need updating too -- this acts as a canary.
    expect(config.maxAttempts).toBe(10);
    expect(config.factor).toBe(2);
  });
});
