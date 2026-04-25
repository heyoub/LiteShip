/**
 * ease — named easing functions. Each is a pure (t: number) => number
 * on t in [0,1]. `stepped(n)` is a factory. Extending this catalog
 * requires an ADR amendment (cap-the-catalog rule per ADR-0001/0008).
 *
 * @module
 */

/** Easing function signature: maps normalized time t in [0,1] to a value. */
export type EaseFn = (t: number) => number;

/** Smooth cubic hermite ease — zero derivatives at endpoints. */
const cubic: EaseFn = (t) => t * t * (3 - 2 * t);

/** Spring ease — overshoots past 1 then settles; models elastic rebound. */
const spring: EaseFn = (t) => 1 - Math.cos(t * Math.PI * 1.5) * Math.exp(-t * 4);

/** Bounce ease — simulates a ball bouncing with diminishing rebounds. */
const bounce: EaseFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

/** Factory: quantize t into `steps` discrete levels. */
const stepped =
  (steps: number): EaseFn =>
  (t) =>
    Math.floor(t * steps) / steps;

/** Named easing catalog. Closed set; extend via ADR amendment. */
export const ease = { cubic, spring, bounce, stepped } as const;
