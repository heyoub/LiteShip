/** Single source for flex:verify, directive-suite, and runtime-seams LLM steady policy. */

/** Max replicate exceedance rate for flex gate (flex uses <=). */
export const LLM_STEADY_REPLICATE_EXCEEDANCE_MAX = 0.2 as const;
/** Max directive P99 / baseline P99 ratio in flex Performance gate. */
export const LLM_STEADY_P99_TO_BASELINE_MAX = 1.5 as const;
/** Absolute P99 budget for diagnostic steady-state LLM frame scheduling. */
export const LLM_STEADY_DIRECTIVE_P99_MAX_NS = 1_000_000 as const;

/** Bench pairs allowed to report benchStability.noisy without failing flex. */
export const ACCEPTED_BENCH_STABILITY_NOISY_LABELS = [
  'worker-runtime-startup-shared',
  'satellite',
  'worker',
  'llm-runtime-steady',
] as const;
