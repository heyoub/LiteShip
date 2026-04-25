/**
 * Component test: Resumption protocol (save/load/clear state, resume logic).
 *
 * Tests the network-facing paths of Resumption that are not covered by the
 * pure-helper tests in sse.test.ts.  Mocks sessionStorage and fetch.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { Resumption } from '@czap/web';
import type { ResumptionState } from '@czap/web';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const makeSessionStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    get length() {
      return store.size;
    },
    key: vi.fn((_i: number) => null as string | null),
  };
};

const mockResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'Content-Type': 'application/json' },
  });

const sampleState: ResumptionState = {
  lastEventId: '42',
  lastSequence: 42,
  artifactId: 'art-1',
  timestamp: 1700000000,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let storage: ReturnType<typeof makeSessionStorage>;

beforeEach(() => {
  storage = makeSessionStorage();
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('location', { origin: 'http://localhost:3000' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// saveState / loadState / clearState
// ---------------------------------------------------------------------------

describe('Resumption.saveState / loadState', () => {
  test('round-trip: save then load returns same state', async () => {
    await Effect.runPromise(Resumption.saveState(sampleState));
    const loaded = await Effect.runPromise(Resumption.loadState('art-1'));
    expect(loaded).toEqual(sampleState);
  });

  test('loadState returns null for missing key', async () => {
    const loaded = await Effect.runPromise(Resumption.loadState('nonexistent'));
    expect(loaded).toBeNull();
  });

  test('loadState returns null and cleans up corrupt JSON', async () => {
    storage.setItem('czap:resumption:bad', '{not json');
    const loaded = await Effect.runPromise(Resumption.loadState('bad'));
    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('czap:resumption:bad');
  });
});

describe('Resumption.clearState', () => {
  test('clears previously saved state', async () => {
    await Effect.runPromise(Resumption.saveState(sampleState));
    await Effect.runPromise(Resumption.clearState('art-1'));
    const loaded = await Effect.runPromise(Resumption.loadState('art-1'));
    expect(loaded).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resume()
// ---------------------------------------------------------------------------

describe('Resumption.resume', () => {
  test('no prior state → requests snapshot', async () => {
    const snapshotBody = { html: '<div>hi</div>', signals: { a: 1 }, lastEventId: '99' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(snapshotBody)));

    const result = await Effect.runPromise(Resumption.resume('art-1', '50'));

    expect(result.type).toBe('snapshot');
    if (result.type === 'snapshot') {
      expect(result.html).toBe('<div>hi</div>');
      expect(result.signals).toEqual({ a: 1 });
      expect(result.lastEventId).toBe('99');
    }
  });

  test('gap <= 0 → returns empty replay', async () => {
    // Save state with lastSequence=10
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));

    // currentEventId parses to sequence 10 → gap = 10 - 11 = -1 ≤ 0
    const result = await Effect.runPromise(Resumption.resume('art-1', '10'));
    expect(result).toEqual({ type: 'replay', patches: [] });
  });

  test('gap > maxGapSize → falls back to snapshot', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 1, lastEventId: '1' }));

    const snapshotBody = { html: '<p>snap</p>', signals: {}, lastEventId: '200' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(snapshotBody)));

    // sequence 200, gap = 200 - 2 = 198 > default maxGapSize of 50
    const result = await Effect.runPromise(Resumption.resume('art-1', '200'));
    expect(result.type).toBe('snapshot');
  });

  test('small gap → requests replay patches', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));

    const replayBody = { patches: [{ op: 'replace', path: '/a', value: 1 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(replayBody)));

    const result = await Effect.runPromise(Resumption.resume('art-1', '15'));
    expect(result).toEqual({ type: 'replay', patches: replayBody.patches });
  });

  test('snapshot fetch failure → Effect fails with error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500)));

    const result = Effect.runPromise(Resumption.resume('art-1', '50'));
    await expect(result).rejects.toThrow(/Snapshot request failed.*500/);
  });

  test('snapshot network failure surfaces the fetch error context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(/Failed to fetch snapshot/);
  });

  test('replay fetch failure → Effect fails with error', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500)));

    const result = Effect.runPromise(Resumption.resume('art-1', '15'));
    await expect(result).rejects.toThrow(/Replay request failed.*500/);
  });

  test('replay network failure surfaces the fetch error context', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(/Failed to fetch replay/);
  });

  test('rejects snapshot URLs that do not satisfy the endpoint policy', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      Effect.runPromise(
        Resumption.resume('art-1', '50', {
          snapshotUrl: 'https://cdn.example.com/fx/snapshot',
        }),
      ),
    ).rejects.toThrow(/Snapshot URL rejected/);

    expect(fetch).not.toHaveBeenCalled();
  });

  test('rejects replay URLs that do not satisfy the endpoint policy', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      Effect.runPromise(
        Resumption.resume('art-1', '15', {
          replayUrl: 'https://cdn.example.com/fx/replay',
        }),
      ),
    ).rejects.toThrow(/Replay URL rejected/);

    expect(fetch).not.toHaveBeenCalled();
  });

  test('snapshot URL includes artifactId in path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ html: '', signals: {}, lastEventId: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await Effect.runPromise(Resumption.resume('my-artifact', '50'));

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('my-artifact');
  });

  test('absolute snapshot URLs preserve host while appending the artifact path exactly once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ html: '', signals: {}, lastEventId: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await Effect.runPromise(
      Resumption.resume('absolute-artifact', '50', {
        snapshotUrl: 'https://cdn.example.com/fx/snapshot',
        endpointPolicy: {
          mode: 'allowlist',
          byKind: {
            snapshot: ['https://cdn.example.com'],
          },
        },
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/fx/snapshot/absolute-artifact');
  });

  test('replay URL includes from/to query params', async () => {
    await Effect.runPromise(
      Resumption.saveState({ ...sampleState, artifactId: 'art-2', lastSequence: 10, lastEventId: '10' }),
    );

    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ patches: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await Effect.runPromise(Resumption.resume('art-2', '15'));

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('from')).toBe('10');
    expect(url.searchParams.get('to')).toBe('15');
  });

  test('absolute replay URLs preserve host and append from/to query params', async () => {
    await Effect.runPromise(
      Resumption.saveState({ ...sampleState, artifactId: 'art-3', lastSequence: 10, lastEventId: '10' }),
    );

    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ patches: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await Effect.runPromise(
      Resumption.resume('art-3', '15', {
        replayUrl: 'https://cdn.example.com/fx/replay',
        endpointPolicy: {
          mode: 'allowlist',
          byKind: {
            replay: ['https://cdn.example.com'],
          },
        },
      }),
    );

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin).toBe('https://cdn.example.com');
    expect(url.pathname).toBe('/fx/replay/art-3');
    expect(url.searchParams.get('from')).toBe('10');
    expect(url.searchParams.get('to')).toBe('15');
  });

  test('rejects traversal-like artifact IDs before building snapshot or replay URLs', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(Effect.runPromise(Resumption.resume('../../admin', '15'))).rejects.toThrow(/Invalid artifactId/);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('loadState returns null for structurally invalid sessionStorage data (missing fields)', async () => {
    // Valid JSON but not a valid ResumptionState -- missing lastSequence and timestamp
    storage.setItem('czap:resumption:bad-shape', JSON.stringify({ artifactId: 'bad-shape', lastEventId: 'evt-1' }));
    const loaded = await Effect.runPromise(Resumption.loadState('bad-shape'));
    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('czap:resumption:bad-shape');
  });

  test('loadState returns null when sessionStorage contains a non-object JSON value', async () => {
    storage.setItem('czap:resumption:num', '42');
    const loaded = await Effect.runPromise(Resumption.loadState('num'));
    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('czap:resumption:num');
  });

  test('loadState returns null when sessionStorage fields have wrong types', async () => {
    storage.setItem(
      'czap:resumption:wrong-types',
      JSON.stringify({
        artifactId: 'wrong-types',
        lastEventId: 123, // should be string
        lastSequence: 'not-a-number', // should be number
        timestamp: 1700000000,
      }),
    );
    const loaded = await Effect.runPromise(Resumption.loadState('wrong-types'));
    expect(loaded).toBeNull();
  });

  test('snapshot response missing html field is rejected with clear error', async () => {
    // Response has signals and lastEventId but no html
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ signals: {}, lastEventId: '1' })));

    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(
      /Malformed snapshot response/,
    );
  });

  test('snapshot response JSON parse failure is surfaced clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockRejectedValue(new Error('bad snapshot json')),
      } satisfies Partial<Response>),
    );

    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(/Failed to parse snapshot/);
  });

  test('snapshot response with non-string lastEventId is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ html: '<p>ok</p>', signals: {}, lastEventId: 999 })),
    );

    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(
      /Malformed snapshot response/,
    );
  });

  test('replay response missing patches array is rejected with clear error', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));

    // Response is an object but patches is not an array
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ patches: 'not-an-array' })));

    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(
      /Malformed replay response/,
    );
  });

  test('replay response JSON parse failure is surfaced clearly', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockRejectedValue(new Error('bad replay json')),
      } satisfies Partial<Response>),
    );

    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(/Failed to parse replay/);
  });

  test('replay response that is a bare array (not wrapped in {patches}) is rejected', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse([{ op: 'add' }])));

    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(
      /Malformed replay response/,
    );
  });

  test('snapshot response that decodes to a primitive (null/string) is rejected as malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(null)));
    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(/Malformed snapshot response/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('just-a-string')));
    await expect(Effect.runPromise(Resumption.resume('art-1', '50'))).rejects.toThrow(/Malformed snapshot response/);
  });

  test('replay response that decodes to a primitive (null/string) is rejected as malformed', async () => {
    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(null)));
    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(/Malformed replay response/);

    await Effect.runPromise(Resumption.saveState({ ...sampleState, lastSequence: 10, lastEventId: '10' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('literal-string')));
    await expect(Effect.runPromise(Resumption.resume('art-1', '15'))).rejects.toThrow(/Malformed replay response/);
  });

  test('loadState rethrows non-Syntax parse failures so callers do not silently swallow storage bugs', async () => {
    storage.setItem('czap:resumption:bad', '{"artifactId":"bad"}');
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new TypeError('parse exploded');
    });

    await expect(Effect.runPromise(Resumption.loadState('bad'))).rejects.toThrow('parse exploded');
    expect(storage.removeItem).not.toHaveBeenCalledWith('czap:resumption:bad');

    parseSpy.mockRestore();
  });
});
