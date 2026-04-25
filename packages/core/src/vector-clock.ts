/**
 * VectorClock -- causality tracking for distributed systems.
 *
 * @module
 */

interface VectorClockShape {
  readonly _tag: 'VectorClock';
  readonly entries: ReadonlyMap<string, number>;
}

const _make = (): VectorClockShape => ({
  _tag: 'VectorClock',
  entries: new Map(),
});

const _from = (entries: Record<string, number>): VectorClockShape => ({
  _tag: 'VectorClock',
  entries: new Map(Object.entries(entries)),
});

const _get = (vc: VectorClockShape, peerId: string): number => vc.entries.get(peerId) ?? 0;

const _tick = (vc: VectorClockShape, peerId: string): VectorClockShape => {
  const newEntries = new Map(vc.entries);
  newEntries.set(peerId, _get(vc, peerId) + 1);
  return { _tag: 'VectorClock', entries: newEntries };
};

const _merge = (a: VectorClockShape, b: VectorClockShape): VectorClockShape => {
  const newEntries = new Map(a.entries);
  for (const [peerId, counter] of b.entries) {
    const existing = newEntries.get(peerId) ?? 0;
    newEntries.set(peerId, Math.max(existing, counter));
  }
  return { _tag: 'VectorClock', entries: newEntries };
};

const _happensBefore = (a: VectorClockShape, b: VectorClockShape): boolean => {
  const allPeers = new Set([...a.entries.keys(), ...b.entries.keys()]);
  let hasStrictlyLess = false;

  for (const peerId of allPeers) {
    const aValue = _get(a, peerId);
    const bValue = _get(b, peerId);
    if (aValue > bValue) return false;
    if (aValue < bValue) hasStrictlyLess = true;
  }

  return hasStrictlyLess;
};

const _equals = (a: VectorClockShape, b: VectorClockShape): boolean => {
  const allPeers = new Set([...a.entries.keys(), ...b.entries.keys()]);
  for (const peerId of allPeers) {
    if (_get(a, peerId) !== _get(b, peerId)) return false;
  }
  return true;
};

const _concurrent = (a: VectorClockShape, b: VectorClockShape): boolean =>
  !_happensBefore(a, b) && !_happensBefore(b, a) && !_equals(a, b);

const _compare = (a: VectorClockShape, b: VectorClockShape): -1 | 0 | 1 => {
  if (_happensBefore(a, b)) return -1;
  if (_happensBefore(b, a)) return 1;
  return 0;
};

const _toObject = (vc: VectorClockShape): Record<string, number> => Object.fromEntries(vc.entries);

const _peers = (vc: VectorClockShape): string[] => [...vc.entries.keys()];

const _size = (vc: VectorClockShape): number => vc.entries.size;

/**
 * VectorClock — per-peer counter algebra for causal ordering.
 * Pairs with {@link HLC} when you need exact happens-before rather than HLC's
 * hybrid ordering.
 */
export const VectorClock = {
  /** Build an empty vector clock. */
  make: _make,
  /** Build a vector clock from an existing `Record<peer, counter>`. */
  from: _from,
  /** Read the counter for a single peer. */
  get: _get,
  /** Increment the counter for the given peer, returning a new clock. */
  tick: _tick,
  /** Pointwise-max merge of two clocks. */
  merge: _merge,
  /** `true` iff `a` strictly happens-before `b`. */
  happensBefore: _happensBefore,
  /** `true` iff `a` and `b` are causally concurrent. */
  concurrent: _concurrent,
  /** Exact structural equality. */
  equals: _equals,
  /** `-1 | 0 | 1` comparator suitable for `sort`; `0` when concurrent. */
  compare: _compare,
  /** Convert to a plain `Record<peer, counter>`. */
  toObject: _toObject,
  /** List peers known to the clock. */
  peers: _peers,
  /** Number of peers. */
  size: _size,
};

export declare namespace VectorClock {
  /** Structural shape of a vector clock: a `Map<peer, counter>` wrapper. */
  export type Shape = VectorClockShape;
}
