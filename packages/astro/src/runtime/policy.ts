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
 * Module-private source of truth for the active runtime policy. Lives
 * in a closure no external script can `Object.defineProperty` past;
 * the window global is a discoverable broadcast and a cross-bundle
 * bridge, not the canonical store. Production callers always go
 * through `configureRuntimePolicy` / `readRuntimePolicy`, both of
 * which read the closure first.
 *
 * @internal
 */
let _currentPolicy: NormalizedRuntimeSecurityPolicy | null = null;

/**
 * Tracks whether the cross-bundle window broadcast has been published.
 * The broadcast happens once per realm with `configurable: false` so
 * an attacker with script execution cannot redefine the property on
 * later loaders. Subsequent `configureRuntimePolicy` calls (HMR,
 * tests) update the module-private store but skip a re-broadcast,
 * which would throw against the locked descriptor. The broadcast is
 * informational; consumers in the same module-graph see updates
 * through the closure regardless.
 *
 * @internal
 */
let _windowGlobalPublished = false;

/**
 * Normalise `policy` and install it as the active runtime configuration.
 *
 * The first call in a given realm publishes the value to
 * `window.__CZAP_RUNTIME_POLICY__` with `configurable: false` and
 * `writable: false`, so an attacker cannot redefine the global via
 * `Object.defineProperty` to install a permissive policy. Subsequent
 * calls (HMR, test re-initialisation) update the module-private store
 * only — the window global stays locked at the first published value.
 *
 * Production callers run `configureRuntimePolicy` once during the
 * integration boot script. Test harnesses re-call it freely; reads
 * via `readRuntimePolicy()` return the latest configured value
 * because the module-private store is checked first.
 */
export function configureRuntimePolicy(policy?: RuntimeSecurityPolicy): NormalizedRuntimeSecurityPolicy {
  const normalized = normalizeRuntimeSecurityPolicy(policy);
  _currentPolicy = normalized;

  if (!_windowGlobalPublished) {
    writeRuntimeGlobal('__CZAP_RUNTIME_POLICY__', normalized, { configurable: false });
    _windowGlobalPublished = true;
  }

  return normalized;
}

/**
 * Read the active runtime policy. Prefers the module-private store
 * (the canonical source of truth), falls back to the cross-bundle
 * window broadcast for consumers loaded as a separate bundle, and
 * finally to a default normalised policy when nothing has been
 * configured (e.g. in tests that haven't called
 * `configureRuntimePolicy` yet).
 */
export function readRuntimePolicy(): NormalizedRuntimeSecurityPolicy {
  if (_currentPolicy) return _currentPolicy;
  return (
    readRuntimeGlobal('__CZAP_RUNTIME_POLICY__', isNormalizedRuntimeSecurityPolicy) ?? normalizeRuntimeSecurityPolicy()
  );
}

/**
 * Reset the module-private policy store to its uninitialised state.
 * Test-only: production code must not call this. The window-global
 * broadcast is intentionally NOT cleared (the descriptor is
 * non-configurable and cannot be redefined within a single realm).
 *
 * @internal
 */
export function _resetRuntimePolicyForTests(): void {
  _currentPolicy = null;
}

/** Convenience accessor for the endpoint sub-policy. */
export function readRuntimeEndpointPolicy(): NormalizedRuntimeEndpointPolicy {
  return readRuntimePolicy().endpointPolicy;
}

/** Convenience accessor for the HTML sub-policy. */
export function readRuntimeHtmlPolicy(): NormalizedRuntimeSecurityPolicy['htmlPolicy'] {
  return readRuntimePolicy().htmlPolicy;
}
