/**
 * Diagnostics -- centralized runtime warning/error emission.
 *
 * Provides typed warning/error helpers with a swappable sink so runtime
 * boundaries can emit operator-visible diagnostics without hard-coding
 * console calls throughout the codebase.
 *
 * @module
 */

/** Severity level for a {@link DiagnosticEvent}. */
export type DiagnosticLevel = 'warn' | 'error';

/**
 * Operator-facing payload shape for a single diagnostic emission: a stable
 * `source`/`code` pair for filtering, a human message, plus optional structured
 * detail and an underlying cause.
 */
export interface DiagnosticPayload {
  readonly source: string;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly detail?: unknown;
}

/** A {@link DiagnosticPayload} enriched with severity and an emission timestamp. */
export interface DiagnosticEvent extends DiagnosticPayload {
  readonly level: DiagnosticLevel;
  readonly timestamp: number;
}

/** Swappable transport that receives {@link DiagnosticEvent}s from {@link Diagnostics}. */
export interface DiagnosticsSink {
  emit(event: DiagnosticEvent): void;
}

type ConsoleMethodName = Extract<DiagnosticLevel, 'warn' | 'error'>;

interface ConsoleLike {
  readonly warn?: (...args: readonly unknown[]) => void;
  readonly error?: (...args: readonly unknown[]) => void;
}

function asConsoleLike(value: unknown): ConsoleLike | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  // Require at least one usable method; warn/error may be absent in stripped envs.
  if (typeof v['warn'] !== 'function' && typeof v['error'] !== 'function') return null;
  return value as ConsoleLike;
}

function getConsoleMethod(level: ConsoleMethodName): ((...args: readonly unknown[]) => void) | null {
  const consoleLike = asConsoleLike(globalThis.console);
  const method = consoleLike?.[level];
  return typeof method === 'function' ? method.bind(consoleLike) : null;
}

function formatHeadline(event: DiagnosticEvent): string {
  return `[${event.source}] ${event.code}: ${event.message}`;
}

function toArgs(event: DiagnosticEvent): readonly unknown[] {
  const args: unknown[] = [formatHeadline(event)];

  if (event.detail !== undefined) {
    args.push(event.detail);
  }

  if (event.cause !== undefined) {
    args.push(event.cause);
  }

  return args;
}

const defaultSink: DiagnosticsSink = {
  emit(event) {
    const method = getConsoleMethod(event.level);
    if (method) {
      method(...toArgs(event));
    }
  },
};

let currentSink: DiagnosticsSink = defaultSink;
const onceKeys = new Set<string>();

function toEvent(level: DiagnosticLevel, payload: DiagnosticPayload): DiagnosticEvent {
  return {
    ...payload,
    level,
    timestamp: Date.now(),
  };
}

function emit(level: DiagnosticLevel, payload: DiagnosticPayload): DiagnosticEvent {
  const event = toEvent(level, payload);
  currentSink.emit(event);
  return event;
}

function buildOnceKey(payload: DiagnosticPayload): string {
  return `${payload.source}:${payload.code}:${payload.message}`;
}

function warn(payload: DiagnosticPayload): DiagnosticEvent {
  return emit('warn', payload);
}

function error(payload: DiagnosticPayload): DiagnosticEvent {
  return emit('error', payload);
}

function warnOnce(payload: DiagnosticPayload): DiagnosticEvent | null {
  const key = buildOnceKey(payload);
  if (onceKeys.has(key)) {
    return null;
  }

  onceKeys.add(key);
  return warn(payload);
}

function setSink(sink: DiagnosticsSink): void {
  currentSink = sink;
}

function resetSink(): void {
  currentSink = defaultSink;
}

function clearOnce(): void {
  onceKeys.clear();
}

function reset(): void {
  resetSink();
  clearOnce();
}

function createBufferSink(): { readonly sink: DiagnosticsSink; readonly events: DiagnosticEvent[] } {
  const events: DiagnosticEvent[] = [];
  return {
    sink: {
      emit(event) {
        events.push(event);
      },
    },
    events,
  };
}

/**
 * Diagnostics facade — runtime boundaries call {@link Diagnostics.warn} / {@link Diagnostics.error}
 * instead of `console.*` so hosts can redirect or capture every diagnostic via {@link Diagnostics.setSink}.
 */
export const Diagnostics = {
  /** Emit a `warn`-level {@link DiagnosticEvent} to the current sink. */
  warn,
  /** Emit an `error`-level {@link DiagnosticEvent} to the current sink. */
  error,
  /** {@link Diagnostics.warn}, but deduplicated by `source:code:message`. */
  warnOnce,
  /** Replace the active sink (e.g. for tests or hosted environments). */
  setSink,
  /** Restore the default sink that writes through `console`. */
  resetSink,
  /** Clear the deduplication set used by {@link Diagnostics.warnOnce}. */
  clearOnce,
  /** Convenience for `resetSink()` + `clearOnce()` — mostly for test teardown. */
  reset,
  /** Build an in-memory sink that collects events into an array — useful for tests. */
  createBufferSink,
} as const;

export declare namespace Diagnostics {
  /** Alias for {@link DiagnosticPayload}. */
  export type Payload = DiagnosticPayload;
  /** Alias for {@link DiagnosticEvent}. */
  export type Event = DiagnosticEvent;
  /** Alias for {@link DiagnosticLevel}. */
  export type Level = DiagnosticLevel;
  /** Alias for {@link DiagnosticsSink}. */
  export type Sink = DiagnosticsSink;
}
