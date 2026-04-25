import { Diagnostics } from '@czap/core';
import type { RuntimeEndpointKind, RuntimeEndpointPolicy } from '@czap/web';
import { resolveRuntimeUrl } from '@czap/web';
import { readRuntimeEndpointPolicy } from './policy.js';

interface RuntimeEndpointDiagnosticCodes {
  readonly malformedUrl: string;
  readonly crossOriginRejected: string;
  readonly originNotAllowed: string;
  readonly endpointKindNotPermitted: string;
}

/**
 * Fast boolean check -- does `rawUrl` resolve under a `same-origin`
 * stream policy? Handy for runtime code that only needs a guard and
 * does not want to emit diagnostics.
 */
export function isSameOriginRuntimeUrl(rawUrl: string): boolean {
  return (
    resolveRuntimeUrl(rawUrl, {
      kind: 'stream',
      policy: { mode: 'same-origin' },
    }).type === 'allowed'
  );
}

/**
 * Convenience wrapper around {@link allowRuntimeEndpointUrl} that
 * collapses every diagnostic code into a single `code`. Used by
 * directives that only care whether a URL is same-origin-safe.
 */
export function allowSameOriginRuntimeUrl(rawUrl: string | null, source: string, code: string): string | null {
  return allowRuntimeEndpointUrl(rawUrl, 'stream', source, {
    malformedUrl: code,
    crossOriginRejected: code,
    originNotAllowed: code,
    endpointKindNotPermitted: code,
  });
}

function defaultDiagnosticCodes(kind: RuntimeEndpointKind): RuntimeEndpointDiagnosticCodes {
  return {
    malformedUrl: `${kind}-malformed-url-rejected`,
    crossOriginRejected: `${kind}-cross-origin-url-rejected`,
    originNotAllowed: `${kind}-origin-not-allowed`,
    endpointKindNotPermitted: `${kind}-endpoint-kind-not-permitted`,
  };
}

/**
 * Resolve `rawUrl` under the runtime endpoint policy and either
 * return the safe URL string or emit a structured `Diagnostics.warn`
 * describing the rejection reason. Returns `null` for both missing
 * and rejected URLs so callers can bail out uniformly.
 */
export function allowRuntimeEndpointUrl(
  rawUrl: string | null,
  kind: RuntimeEndpointKind,
  source: string,
  codes?: Partial<RuntimeEndpointDiagnosticCodes>,
  policy: RuntimeEndpointPolicy = readRuntimeEndpointPolicy(),
): string | null {
  const resolved = resolveRuntimeUrl(rawUrl, { kind, policy });
  const finalCodes = { ...defaultDiagnosticCodes(kind), ...codes };

  switch (resolved.type) {
    case 'missing':
      return null;
    case 'allowed':
      return resolved.url;
    case 'malformed':
      Diagnostics.warn({
        source,
        code: finalCodes.malformedUrl,
        message: `Runtime URL "${rawUrl}" was rejected because it is not a valid URL.`,
      });
      return null;
    case 'cross-origin-rejected':
      Diagnostics.warn({
        source,
        code: finalCodes.crossOriginRejected,
        message: `Cross-origin runtime URL "${rawUrl}" was rejected. Runtime endpoints must be same-origin by default.`,
      });
      return null;
    case 'origin-not-allowed':
      Diagnostics.warn({
        source,
        code: finalCodes.originNotAllowed,
        message: `Runtime URL "${rawUrl}" was rejected because origin "${resolved.resolved.origin}" is not allowlisted.`,
      });
      return null;
    case 'kind-not-allowed':
      Diagnostics.warn({
        source,
        code: finalCodes.endpointKindNotPermitted,
        message: `Runtime URL "${rawUrl}" was rejected because endpoint kind "${kind}" is not permitted for cross-origin access.`,
      });
      return null;
    case 'private-ip-rejected':
      Diagnostics.warn({
        source,
        code: `${kind}-private-ip-rejected`,
        message: `Runtime URL "${rawUrl}" was rejected because it resolves to a private or reserved IP address.`,
      });
      return null;
  }
}
