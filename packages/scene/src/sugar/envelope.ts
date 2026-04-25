/**
 * Envelope helpers — typed automation curves that attach to component
 * values (opacity, volume, effect intensity). The compositor reads
 * these at tick time; authors write them declaratively.
 *
 * @module
 */

import type { BeatHandle } from './beat.js';

/** Fade envelope (linear over a beat span). */
export interface FadeEnvelope {
  /** Discriminant tag. */
  readonly _t: 'envelope';
  /** Curve kind — linear-in or linear-out. */
  readonly curve: 'linear-in' | 'linear-out';
  /** Duration of the fade in beats. */
  readonly span: BeatHandle;
}

/** Pulse envelope (periodic, amplitude-scaled). */
export interface PulseEnvelope {
  /** Discriminant tag. */
  readonly _t: 'envelope';
  /** Curve kind — pulse. */
  readonly curve: 'pulse';
  /** Period of the pulse in beats. */
  readonly period: BeatHandle;
  /** Peak amplitude (0–1 range, may exceed 1 for overdrive). */
  readonly amplitude: number;
}

/** Fade constructors. */
export const fade = {
  /** Linear fade-in over the given span. */
  in: (span: BeatHandle): FadeEnvelope => ({ _t: 'envelope', curve: 'linear-in', span }),
  /** Linear fade-out over the given span. */
  out: (span: BeatHandle): FadeEnvelope => ({ _t: 'envelope', curve: 'linear-out', span }),
} as const;

/** Pulse constructors. */
export const pulse = {
  /** Periodic pulse with amplitude and period. */
  every: (period: BeatHandle, opts: { amplitude: number }): PulseEnvelope => ({
    _t: 'envelope',
    curve: 'pulse',
    period,
    amplitude: opts.amplitude,
  }),
} as const;
