/**
 * @czap/web/lite tests -- verify Effect-free exports work without
 * importing the Effect runtime.
 *
 * These tests validate the pure function extractions: morph helpers,
 * SSE utilities, and resumption parsing.
 */

import { describe, test, expect } from 'vitest';
import {
  parseMessage,
  calculateDelay,
  buildUrl,
  defaultReconnectConfig,
  parseEventId,
  canResume,
} from '@czap/web/lite';
import type { ReconnectConfig } from '@czap/web/lite';

// ===========================================================================
// SSE Pure: parseMessage
// ===========================================================================

describe('lite parseMessage', () => {
  const msg = (data: string) => ({ data }) as MessageEvent;

  test('parses valid JSON with type field', () => {
    const result = parseMessage(msg(JSON.stringify({ type: 'patch', data: { foo: 1 } })));
    expect(result).toEqual({ type: 'patch', data: { foo: 1 } });
  });

  test('returns null for JSON missing type', () => {
    expect(parseMessage(msg(JSON.stringify({ data: 'no-type' })))).toBeNull();
  });

  test('returns null for non-JSON', () => {
    expect(parseMessage(msg('not json'))).toBeNull();
  });

  test('returns null for empty data', () => {
    expect(parseMessage(msg(''))).toBeNull();
  });

  test('heartbeat message parses correctly', () => {
    expect(parseMessage(msg(JSON.stringify({ type: 'heartbeat' })))).toEqual({ type: 'heartbeat' });
  });

  test('returns null when type is not a string', () => {
    expect(parseMessage(msg(JSON.stringify({ type: 42 })))).toBeNull();
  });

  test('snapshot message parses correctly', () => {
    const result = parseMessage(msg(JSON.stringify({ type: 'snapshot', data: { html: '<div/>' } })));
    expect(result).toEqual({ type: 'snapshot', data: { html: '<div/>' } });
  });
});

// ===========================================================================
// SSE Pure: calculateDelay
// ===========================================================================

describe('lite calculateDelay', () => {
  const config: ReconnectConfig = {
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 2,
  };

  test('first attempt is roughly initialDelay ±25%', () => {
    const delay = calculateDelay(0, config);
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });

  test('delay grows exponentially', () => {
    const delay = calculateDelay(3, config);
    // base = 1000 * 2^3 = 8000, jitter ±25%
    expect(delay).toBeGreaterThanOrEqual(6000);
    expect(delay).toBeLessThanOrEqual(10000);
  });

  test('delay is capped at maxDelay', () => {
    const delay = calculateDelay(20, config);
    expect(delay).toBeLessThanOrEqual(config.maxDelay);
  });
});

// ===========================================================================
// SSE Pure: buildUrl
// ===========================================================================

describe('lite buildUrl', () => {
  test('returns base URL when no artifactId or lastEventId', () => {
    const url = buildUrl('http://localhost/api/stream');
    expect(url).toBe('http://localhost/api/stream');
  });

  test('appends artifactId to path', () => {
    const url = buildUrl('http://localhost/api/stream', 'doc-1');
    expect(url).toBe('http://localhost/api/stream/doc-1');
  });

  test('adds lastEventId as query param', () => {
    const url = buildUrl('http://localhost/api/stream', undefined, 'evt-42');
    expect(url).toContain('lastEventId=evt-42');
  });

  test('combines artifactId and lastEventId', () => {
    const url = buildUrl('http://localhost/api/stream', 'doc-1', 'evt-42');
    expect(url).toContain('/doc-1');
    expect(url).toContain('lastEventId=evt-42');
  });

  test('rejects traversal-like artifact IDs', () => {
    expect(() => buildUrl('http://localhost/api/stream', '../admin')).toThrow(/Invalid artifactId/);
  });
});

// ===========================================================================
// SSE Pure: defaultReconnectConfig
// ===========================================================================

describe('lite defaultReconnectConfig', () => {
  test('has sensible defaults', () => {
    expect(defaultReconnectConfig.maxAttempts).toBe(10);
    expect(defaultReconnectConfig.initialDelay).toBe(1000);
    expect(defaultReconnectConfig.maxDelay).toBe(30000);
    expect(defaultReconnectConfig.factor).toBe(2);
  });
});

// ===========================================================================
// Resumption Pure: parseEventId
// ===========================================================================

describe('lite parseEventId', () => {
  test('parses numeric event ID', () => {
    const result = parseEventId('42');
    expect(result.raw).toBe('42');
    expect(result.sequence).toBe(42);
  });

  test('parses prefixed event ID', () => {
    const result = parseEventId('evt-123');
    expect(result.raw).toBe('evt-123');
    expect(result.sequence).toBe(123);
  });

  test('parses HLC-style event ID with node', () => {
    const result = parseEventId('1700000000-5-node1');
    expect(result.raw).toBe('1700000000-5-node1');
    expect(result.sequence).toBe(5);
    expect(result.timestamp).toBe(1700000000);
    expect(result.nodeId).toBe('node1');
  });

  test('parses simple HLC event ID', () => {
    const result = parseEventId('1700000000-5');
    expect(result.sequence).toBe(5);
    expect(result.timestamp).toBe(1700000000);
  });

  test('returns 0 sequence for unparseable ID', () => {
    const result = parseEventId('totally-random');
    expect(result.sequence).toBe(0);
  });
});

// ===========================================================================
// Resumption Pure: canResume
// ===========================================================================

describe('lite canResume', () => {
  test('returns true when server oldest is empty', () => {
    expect(canResume('evt-42', '')).toBe(true);
  });

  test('returns false when lastEventId is empty', () => {
    expect(canResume('', 'evt-10')).toBe(false);
  });

  test('returns true when client is ahead', () => {
    expect(canResume('evt-42', 'evt-10')).toBe(true);
  });

  test('returns false when client is behind', () => {
    expect(canResume('evt-5', 'evt-10')).toBe(false);
  });

  test('returns true when IDs are equal', () => {
    expect(canResume('evt-10', 'evt-10')).toBe(true);
  });

  test('compares HLC timestamps first', () => {
    expect(canResume('1700000001-0-a', '1700000000-5-b')).toBe(true);
    expect(canResume('1699999999-0-a', '1700000000-5-b')).toBe(false);
  });

  test('falls back to Number() comparison when parsed sequences stay at zero', () => {
    expect(canResume('Infinity', '-Infinity')).toBe(true);
    expect(canResume('-Infinity', 'Infinity')).toBe(false);
  });

  test('falls back to lexicographic comparison when IDs are non-numeric strings', () => {
    expect(canResume('zeta', 'alpha')).toBe(true);
    expect(canResume('alpha', 'zeta')).toBe(false);
  });
});
