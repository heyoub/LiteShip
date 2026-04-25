/**
 * Runtime URL resolution -- resolve user-supplied URLs for streaming,
 * snapshots, replays, LLMs, GPU shaders, and WASM modules under a
 * {@link RuntimeEndpointPolicy}. Prevents common SSRF-style pitfalls
 * (private IPs, `file:` URLs, cross-origin escape) and returns a
 * structured rejection reason instead of silently dropping the URL.
 *
 * @module
 */
import type { RuntimeEndpointKind, RuntimeEndpointPolicy } from '../types.js';

/**
 * Discriminated union returned by {@link resolveRuntimeUrl}. Every
 * non-`allowed` variant preserves enough context for the caller to log
 * or report why the URL was rejected.
 */
export type RuntimeUrlResolution =
  | { readonly type: 'missing' }
  | {
      readonly type: 'malformed';
      readonly rawUrl: string;
      readonly baseOrigin: string;
      readonly reason: 'url-can-parse-rejected' | 'url-constructor-threw';
      readonly detail?: string;
    }
  | { readonly type: 'cross-origin-rejected'; readonly resolved: URL }
  | { readonly type: 'origin-not-allowed'; readonly resolved: URL }
  | { readonly type: 'kind-not-allowed'; readonly resolved: URL }
  | { readonly type: 'private-ip-rejected'; readonly resolved: URL }
  | { readonly type: 'allowed'; readonly url: string; readonly resolved: URL };

/**
 * Options passed to {@link resolveRuntimeUrl}.
 *
 * `kind` is required because per-endpoint-kind allowlists are a core
 * part of the runtime policy. `baseOrigin` defaults to
 * `globalThis.location.origin` on the client.
 */
export interface ResolveRuntimeUrlOptions {
  /** Endpoint category used to pick a per-kind allowlist. */
  readonly kind: RuntimeEndpointKind;
  /** Host-configured endpoint policy (defaults to same-origin). */
  readonly policy?: RuntimeEndpointPolicy;
  /** Base origin for resolving relative URLs; defaults to `location.origin`. */
  readonly baseOrigin?: string;
}

type MalformedRuntimeUrlResolution = Extract<RuntimeUrlResolution, { readonly type: 'malformed' }>;
type NormalizedRuntimeEndpointPolicy = {
  readonly mode: RuntimeEndpointPolicy['mode'];
  readonly allowOrigins: readonly string[];
  readonly byKind: Record<RuntimeEndpointKind, readonly string[]>;
};

function parseAbsoluteUrl(value: string): URL | null {
  let parsed: URL | null = null;

  try {
    if (typeof URL.parse === 'function') {
      parsed = URL.parse(value);
    } else if (typeof URL.canParse === 'function') {
      parsed = URL.canParse(value) ? new URL(value) : null;
    }
  } catch {
    parsed = null;
  }

  return parsed;
}

function normalizeComparableOrigin(origin: string): string | null {
  const parsed = parseAbsoluteUrl(origin);
  return parsed ? parsed.origin.toLowerCase() : null;
}

function runtimeBaseOrigin(baseOrigin?: string): string {
  if (baseOrigin && baseOrigin !== 'null') {
    return baseOrigin;
  }

  const origin = globalThis.location?.origin;
  if (origin && origin !== 'null') {
    return origin;
  }

  return 'http://localhost';
}

function normalizeOriginAllowlist(origins?: readonly string[]): readonly string[] {
  if (!origins || origins.length === 0) {
    return [];
  }

  return origins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(normalizeComparableOrigin)
    .filter((origin): origin is string => origin !== null);
}

function normalizeEndpointPolicy(policy?: RuntimeEndpointPolicy): NormalizedRuntimeEndpointPolicy {
  return {
    mode: policy?.mode ?? 'same-origin',
    allowOrigins: normalizeOriginAllowlist(policy?.allowOrigins),
    byKind: {
      stream: normalizeOriginAllowlist(policy?.byKind?.stream),
      snapshot: normalizeOriginAllowlist(policy?.byKind?.snapshot),
      replay: normalizeOriginAllowlist(policy?.byKind?.replay),
      llm: normalizeOriginAllowlist(policy?.byKind?.llm),
      'gpu-shader': normalizeOriginAllowlist(policy?.byKind?.['gpu-shader']),
      wasm: normalizeOriginAllowlist(policy?.byKind?.wasm),
    },
  };
}

function parseIPv4Octets(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return octets as [number, number, number, number];
}

function isIPv6PrivateOrReserved(hostname: string): boolean {
  // URL parser wraps IPv6 in brackets
  const raw = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const lower = raw.toLowerCase();

  // :: all-zeros (IPv6 equivalent of 0.0.0.0)
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

  // ::1 loopback
  if (lower === '::1') return true;

  // ::ffff:x.x.x.x IPv4-mapped IPv6 — extract the IPv4 part and check it
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) {
    const octets = parseIPv4Octets(v4Mapped[1]!);
    if (octets) {
      const [a, b] = octets;
      if (a === 0) return true;
      if (a === 127) return true;
      if (a === 10) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a >= 224) return true;
    }
    return false;
  }

  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const high = Number.parseInt(hexMapped[1]!, 16);
    const low = Number.parseInt(hexMapped[2]!, 16);
    const octets: [number, number, number, number] = [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
    const [a, b] = octets;
    if (a === 0) return true;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true;
    return false;
  }

  // fe80::/10 link-local
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }

  // fc00::/7 unique local (fc00:: - fdff::)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  return false;
}

/**
 * Return `true` when `hostname` resolves to `localhost`, a private
 * RFC 1918 network, link-local, carrier-grade NAT, or a reserved
 * range. Handles both IPv4 and IPv6 literals. Used to block SSRF
 * attempts against metadata services (e.g. 169.254.169.254).
 */
export function isPrivateOrReservedIP(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (lower === 'localhost') return true;

  // IPv4 checks
  const octets = parseIPv4Octets(lower);
  if (octets) {
    const [a, b] = octets;
    // 0.0.0.0/8 (reserved, RFC 1122)
    if (a === 0) return true;
    // 127.0.0.0/8
    if (a === 127) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 100.64.0.0/10 carrier-grade NAT
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16
    if (a === 169 && b === 254) return true;
    // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved
    if (a >= 224) return true;

    return false;
  }

  // IPv6 checks
  if (isIPv6PrivateOrReserved(lower)) return true;

  return false;
}

function isBlockedProtocol(protocol: string): boolean {
  return protocol === 'file:';
}

function malformedResolution(
  rawUrl: string,
  baseOrigin: string,
  reason: MalformedRuntimeUrlResolution['reason'],
  detail?: string,
): MalformedRuntimeUrlResolution {
  return {
    type: 'malformed',
    rawUrl,
    baseOrigin,
    reason,
    ...(detail ? { detail } : {}),
  };
}

/**
 * Resolve a user-supplied `rawUrl` under `options.policy` and classify
 * the result as one of {@link RuntimeUrlResolution}'s variants.
 *
 * The function never throws; malformed URLs produce a `malformed`
 * variant and cross-origin / policy violations produce correspondingly
 * typed rejections. Relative URLs inherit the base origin and bypass
 * the private-IP SSRF check (they cannot point outside it).
 */
export function resolveRuntimeUrl(
  rawUrl: string | null | undefined,
  options: ResolveRuntimeUrlOptions,
): RuntimeUrlResolution {
  if (!rawUrl) {
    return { type: 'missing' };
  }

  const baseOrigin = runtimeBaseOrigin(options.baseOrigin);
  if (typeof URL.canParse === 'function' && !URL.canParse(rawUrl, baseOrigin)) {
    return malformedResolution(rawUrl, baseOrigin, 'url-can-parse-rejected');
  }

  let resolved: URL;
  try {
    resolved = new URL(rawUrl, baseOrigin);
  } catch (error) {
    return malformedResolution(
      rawUrl,
      baseOrigin,
      'url-constructor-threw',
      error instanceof Error ? error.message : String(error),
    );
  }

  const normalizedBaseOrigin = normalizeComparableOrigin(baseOrigin) ?? baseOrigin.toLowerCase();
  const normalizedResolvedOrigin = resolved.origin.toLowerCase();

  // Block file: protocol unconditionally.
  if (isBlockedProtocol(resolved.protocol)) {
    return { type: 'private-ip-rejected', resolved };
  }

  // For absolute URLs (those containing a scheme), block private/reserved IPs
  // to prevent SSRF attacks (e.g. http://169.254.169.254, http://10.0.0.1).
  // Relative paths (e.g. "/stream") inherit the page origin and are not SSRF vectors.
  const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(rawUrl);
  if (isAbsoluteUrl && isPrivateOrReservedIP(resolved.hostname)) {
    return { type: 'private-ip-rejected', resolved };
  }

  if (normalizedResolvedOrigin === normalizedBaseOrigin) {
    return { type: 'allowed', url: rawUrl, resolved };
  }

  const policy = normalizeEndpointPolicy(options.policy);
  if (policy.mode === 'same-origin') {
    return { type: 'cross-origin-rejected', resolved };
  }

  const globalAllowlist = policy.allowOrigins;
  const kindAllowlist = policy.byKind[options.kind];
  if (globalAllowlist.includes(normalizedResolvedOrigin) || kindAllowlist.includes(normalizedResolvedOrigin)) {
    return { type: 'allowed', url: rawUrl, resolved };
  }

  const hasKindRules = Object.values(policy.byKind).some((allowlist) => allowlist.length > 0);
  if (globalAllowlist.length === 0 && hasKindRules && kindAllowlist.length === 0) {
    return { type: 'kind-not-allowed', resolved };
  }

  return { type: 'origin-not-allowed', resolved };
}
