/**
 * Value lerping between output states.
 *
 * Linearly interpolates all numeric properties of a record
 * from one state to another, controlled by an eased progress value.
 *
 * @module
 */

/**
 * Interpolate between two numeric records using an eased value [0..1].
 * Returns a new record with each property lerped: from[k] + (to[k] - from[k]) * eased.
 */
export function interpolate<T extends Record<string, number>>(
  from: T,
  to: T,
  eased: number,
  defaults?: Partial<Record<string, number>>,
): T {
  const result: Record<string, number> = {};
  for (const [key, a] of Object.entries(from)) {
    const b = to[key] ?? a;
    result[key] = a + (b - a) * eased;
  }
  // Second pass: keys only in `to` (interpolate from implicit 0)
  for (const [key, b] of Object.entries(to)) {
    if (key in result) {
      continue;
    }

    const base = defaults?.[key] ?? 0;
    result[key] = base + (b - base) * eased;
  }
  // `result` has every key present in `from`/`to`, both of which are T. The
  // output is structurally a T but TS can't infer that through Object.entries.
  return result as unknown as T;
}
