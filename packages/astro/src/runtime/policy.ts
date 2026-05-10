/**
 * Runtime security-policy data model: how `@czap/astro`'s client
 * directives decide which endpoints they may fetch and how to treat
 * HTML returned from those endpoints.
 *
 * @module
 */
import type { HtmlPolicy, RuntimeEndpointKind, RuntimeEndpointPolicy } from '@czap/web';
import { readRuntimeGlobal, writeRuntimeGlobal } from './globals.js';

/**
 * User-supplied HTML policy. Directives fall back to conservative
 * defaults (`text` for LLM output, `sanitized-html` for stream
 * payloads) when individual fields are omitted.
 */
export interface RuntimeHtmlPolicy {
  /** Default HTML trust level for `client:llm` text sinks. */
  readonly llmDefault?: HtmlPolicy;
  /** Default HTML trust level for `client:stream` payloads. */
  readonly streamDefault?: HtmlPolicy;
  /** Opt-in to `trusted-html` system-wide. */
  readonly allowTrustedHtml?: boolean;
}

/**
 * Combined runtime security policy (endpoint + HTML). Passed to
 * {@link configureRuntimePolicy} and persisted on `window` for
 * directive consumption.
 */
export interface RuntimeSecurityPolicy {
  /** Endpoint allowlist configuration. */
  readonly endpointPolicy?: RuntimeEndpointPolicy;
  /** HTML policy configuration. */
  readonly htmlPolicy?: RuntimeHtmlPolicy;
}

/**
 * Frozen, fully-populated form of {@link RuntimeEndpointPolicy}. Every
 * `RuntimeEndpointKind` has an allowlist (possibly empty) so callers
 * can index safely without presence checks.
 */
export interface NormalizedRuntimeEndpointPolicy {
  readonly mode: RuntimeEndpointPolicy['mode'];
  readonly allowOrigins: readonly string[];
  readonly byKind: Readonly<Record<RuntimeEndpointKind, readonly string[]>>;
}

/**
 * Frozen form of {@link RuntimeSecurityPolicy} with every optional
 * field materialised to its default. Produced by
 * {@link normalizeRuntimeSecurityPolicy}.
 */
export interface NormalizedRuntimeSecurityPolicy {
  readonly endpointPolicy: NormalizedRuntimeEndpointPolicy;
  readonly htmlPolicy: {
    readonly llmDefault: HtmlPolicy;
    readonly streamDefault: HtmlPolicy;
    readonly allowTrustedHtml: boolean;
  };
}

function isNormalizedRuntimeSecurityPolicy(value: unknown): value is NormalizedRuntimeSecurityPolicy {
  return (
    typeof value === 'object' &&
    value !== null &&
    'endpointPolicy' in value &&
    'htmlPolicy' in value &&
    typeof value.endpointPolicy === 'object' &&
    value.endpointPolicy !== null &&
    typeof value.htmlPolicy === 'object' &&
    value.htmlPolicy !== null
  );
}

const DEFAULT_ENDPOINT_POLICY: NormalizedRuntimeEndpointPolicy = Object.freeze({
  mode: 'same-origin',
  allowOrigins: Object.freeze([]),
  byKind: Object.freeze({
    stream: Object.freeze([]),
    snapshot: Object.freeze([]),
    replay: Object.freeze([]),
    llm: Object.freeze([]),
    'gpu-shader': Object.freeze([]),
    wasm: Object.freeze([]),
  }),
});

const DEFAULT_HTML_POLICY: {
  readonly llmDefault: HtmlPolicy;
  readonly streamDefault: HtmlPolicy;
  readonly allowTrustedHtml: boolean;
} = Object.freeze({
  llmDefault: 'text',
  streamDefault: 'sanitized-html',
  allowTrustedHtml: false,
});

function freezeOrigins(origins?: readonly string[]): readonly string[] {
  return Object.freeze((origins ?? []).map((origin) => origin.trim()).filter((origin) => origin.length > 0));
}

function freezeEndpointPolicy(policy?: RuntimeEndpointPolicy): NormalizedRuntimeEndpointPolicy {
  if (!policy) {
    return DEFAULT_ENDPOINT_POLICY;
  }

  // Fully populate every kind up-front so the record is typed correctly
  // from the initializer, without an empty-literal cast.
  const byKind: Record<RuntimeEndpointKind, readonly string[]> = {
    stream: freezeOrigins(policy.byKind?.stream),
    snapshot: freezeOrigins(policy.byKind?.snapshot),
    replay: freezeOrigins(policy.byKind?.replay),
    llm: freezeOrigins(policy.byKind?.llm),
    'gpu-shader': freezeOrigins(policy.byKind?.['gpu-shader']),
    wasm: freezeOrigins(policy.byKind?.wasm),
  };

  return Object.freeze({
    mode: policy.mode,
    allowOrigins: freezeOrigins(policy.allowOrigins),
    byKind: Object.freeze(byKind),
  });
}

/**
 * Freeze a user-supplied security policy into the fully-populated
 * {@link NormalizedRuntimeSecurityPolicy} form. Applies conservative
 * defaults for any missing fields.
 */
export function normalizeRuntimeSecurityPolicy(policy?: RuntimeSecurityPolicy): NormalizedRuntimeSecurityPolicy {
  return Object.freeze({
    endpointPolicy: freezeEndpointPolicy(policy?.endpointPolicy),
    htmlPolicy: Object.freeze({
      llmDefault: policy?.htmlPolicy?.llmDefault ?? DEFAULT_HTML_POLICY.llmDefault,
      streamDefault: policy?.htmlPolicy?.streamDefault ?? DEFAULT_HTML_POLICY.streamDefault,
      allowTrustedHtml: policy?.htmlPolicy?.allowTrustedHtml ?? DEFAULT_HTML_POLICY.allowTrustedHtml,
    }),
  });
}

/**
 * Normalise `policy` and write it to `window.__CZAP_RUNTIME_POLICY__`
 * so every directive sees the same configuration. Called once during
 * bootstrap by the integration's injected boot script.
 *
 * The value object is frozen at every nesting level (see
 * `normalizeRuntimeSecurityPolicy`); the descriptor remains
 * `configurable: true` so the integration can re-bootstrap on HMR
 * and test harnesses can refresh policy state between cases. An
 * attacker with script execution on the page can redefine the global
 * via `Object.defineProperty`; that is acknowledged in SECURITY.md
 * and is out of scope for this layer (it requires a primary CSP
 * compromise to reach).
 */
export function configureRuntimePolicy(policy?: RuntimeSecurityPolicy): NormalizedRuntimeSecurityPolicy {
  const normalized = normalizeRuntimeSecurityPolicy(policy);
  return writeRuntimeGlobal('__CZAP_RUNTIME_POLICY__', normalized);
}

/**
 * Read the installed runtime policy from `window`. Falls back to the
 * default normalised policy when nothing was configured (e.g. in
 * tests).
 */
export function readRuntimePolicy(): NormalizedRuntimeSecurityPolicy {
  return (
    readRuntimeGlobal('__CZAP_RUNTIME_POLICY__', isNormalizedRuntimeSecurityPolicy) ?? normalizeRuntimeSecurityPolicy()
  );
}

/** Convenience accessor for the endpoint sub-policy. */
export function readRuntimeEndpointPolicy(): NormalizedRuntimeEndpointPolicy {
  return readRuntimePolicy().endpointPolicy;
}

/** Convenience accessor for the HTML sub-policy. */
export function readRuntimeHtmlPolicy(): NormalizedRuntimeSecurityPolicy['htmlPolicy'] {
  return readRuntimePolicy().htmlPolicy;
}
