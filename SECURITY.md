# Security Policy

## Reporting a vulnerability

Please do not open public GitHub issues for security findings.

Instead, use one of these private channels:

- **GitHub Security Advisory** (preferred). From the repo's "Security" tab, click "Report a vulnerability." This creates a private advisory visible only to maintainers.
- **Email**: send to the maintainer via the contact listed on the maintainer profile at [github.com/heyoub](https://github.com/heyoub).

When reporting, please include:

- The affected package and version
- A minimal reproduction (code snippet, repro repo, or `pnpm pack`-installed
  consumer demonstrating the issue)
- The impact you've observed and any thoughts on scope
- Whether you're willing to be credited in the advisory once published

We aim to acknowledge reports within 72 hours and ship a fix or
mitigation within 14 days for high-severity findings. Pre-1.0 means we
may resolve some issues with a breaking change rather than a workaround;
we'll communicate which path before we ship.

## Supported versions

LiteShip is pre-1.0. The latest minor release on the `main` branch is the
only supported line. Older versions may receive security fixes at
maintainer discretion if the fix is trivial to backport.

| Version | Supported |
| --- | --- |
| `0.x` (latest minor) | yes |
| Older `0.x` | best-effort backport on request |

## Security posture (summary)

Trust is set explicitly, not by permission default:

- **Runtime URL allowlist.** Runtime URLs are same-origin by default; cross-origin requires an explicit allowlist policy before the line is run. The allowlist resolver runs a hostname-string blocklist for private/link-local IP literals via `isPrivateOrReservedIP` (`packages/web/src/security/runtime-url.ts:187`), covering RFC 1918, link-local, CG-NAT, `127/8`, `0/8`, and IPv6 unique-local / loopback ranges as literal addresses. **The check operates on the literal hostname, not on the post-DNS-resolution IP.** A hostname like `internal.example.com` that resolves to a private range will pass this check. For DNS-rebinding-class threats, restrict outbound resolution at the network layer (split-horizon DNS or a server-side egress firewall) — LiteShip alone does not defend against attacker-controlled DNS.
- **Artifact ID validation.** IDs are validated as single path segments (`packages/web/src/stream/sse-pure.ts`, `buildUrl`), preventing path-traversal attempts via runtime URL construction.
- **HTML trust pipeline.** Stream and LLM HTML flows route through a shared trust gate (`packages/web/src/security/html-trust.ts`) with three modes: `text` (default, no HTML), `sanitized-html` (strips a tag-name blocklist — `script`, `style`, `iframe`, `object`, `embed`, `svg`, `math`, `base`, `meta`, `link`, `noscript`, `form` — plus event-handler attributes, `srcdoc` / `style`, and `javascript:` / `data:text/html` / `data:text/javascript` / `data:application/x-javascript` schemes on url-sink attributes (`href`, `src`, `xlink:href`, `action`, `formaction`, `ping`, `background`, `cite`, `data`, `poster`)), and explicit `trusted-html` (caller asserts via an opt-in flag, otherwise downgrades to `sanitized-html`). The DOM morph routes through this same pipeline at `packages/web/src/morph/diff-pure.ts:30` (`createHtmlFragment(html, { policy: 'sanitized-html' })`); there is no third unguarded `innerHTML` path. Parsing happens via `<template>.innerHTML` (a non-live, fragment-parser context), which removes the classic mXSS re-serialization vector for the `createHtmlFragment` path; `resolveHtmlString` does re-serialize and so retains a narrower mXSS surface around elements whose serialization differs from their parse (rare; `<noscript>` is now blocklisted). The sanitizer is bespoke (not DOMPurify) and is exercised by `tests/regression/red-team-runtime.test.ts` (regression cases including `<script>`, `<iframe>`, `<embed>`, `<object>`, `<svg>`, `<math>`, `<style>`, `<base>`, `<meta>`, `<link>`, `<form>`, `<noscript>`, `formaction`/`action`/`ping` `javascript:` schemes, and `data:`-variant URI schemes on url-sink attributes); for high-assurance deployments, an independent audit before relying on it as the sole defense is recommended.
- **Theme/CSS sanitization.** Theme compilation (`compileTheme` in `packages/edge/src/theme-compiler.ts`) rejects unsafe prefixes (e.g. attempts to escape custom-property scoping) and CSS-breaking token values.
- **Boundary state surface.** Boundary state application (`packages/astro/src/runtime/boundary.ts`) filters CSS keys to `--czap-*` and DOM attributes to `role` / `aria-*`. Arbitrary attribute injection is rejected at the application layer.
- **Bootstrap snapshot hardening.** The `__CZAP_DETECT__` snapshot is non-enumerable, frozen, and intentionally minimal. Astro integration installs the runtime policy in two places: (1) a module-private store inside `packages/astro/src/runtime/policy.ts` is the canonical source of truth — a closure no external script can reach via `Object.defineProperty`; (2) a frozen `window.__CZAP_RUNTIME_POLICY__` cross-bundle broadcast is published once per realm with `configurable: false` + `writable: false`, so an attacker who later runs script on the page cannot redefine the global. HMR re-bootstraps and test harnesses update the module-private store; the window broadcast stays locked at first publish. Reads (`readRuntimePolicy`) check the module-private store first and fall back to the broadcast only for consumers loaded as a separate bundle.
- **No eval, no new Function.** Untrusted text never becomes executable JavaScript at runtime. Verified by grep across `packages/*/src/`; the discipline is enforced by code review, not by an ESLint rule today (a `no-eval` / `no-new-func` rule is on the roadmap). WASM bytecode does run at runtime, sandboxed by the host's WASM runtime; the no-WASM fallback (`packages/core/src/wasm-fallback.ts`) keeps the same kernels available in pure TypeScript.

## CSP and Trusted Types

Runtime code is compatible with strict CSP policies in the sense that LiteShip itself does not call `eval` or `new Function`. Deploying under strict CSP still requires the host to make several deliberate decisions, and LiteShip does not abstract them.

### Required directives for a host CSP

- `script-src`: Astro injects bootstrap scripts. The host must add per-request hashes or nonces. There is no built-in nonce-threading API; the host plumbs the nonce into the Astro integration and keeps it consistent with the response header.
- `worker-src`: the off-thread compositor, render worker, and audio processor are spawned from `blob:` URLs (`packages/worker/src/compositor-startup.ts`, `packages/worker/src/render-worker.ts`, `packages/web/src/audio/processor-bootstrap.ts`). A policy of `worker-src 'self'` will silently fail these workers; the host needs `worker-src blob:` (or `worker-src 'self' blob:`) for the off-thread paths to start. **Note that `blob:` is a wildcard for any blob URL the page can construct — including blobs an attacker could create if they have script execution elsewhere.** That tradeoff is the cost of the inline-worker bootstrap; if your threat model can't accept it, the alternative is to host the worker scripts under a same-origin path (a follow-up packaging mode that LiteShip doesn't ship today).
- `connect-src`: SSE and LLM endpoints. The host's allowlist policy (see "Runtime URL allowlist" above) must agree with the CSP `connect-src` list.

### Trusted Types

LiteShip writes to `innerHTML` in two sanctioned places: the templated HTML-fragment helper at `packages/web/src/security/html-trust.ts` (`createHtmlFragment`, used by the DOM morph and slot-injection paths) and the LLM session HTML sink at `packages/astro/src/runtime/llm-session.ts`. Both are gated by the shared trust pipeline (`text` / `sanitized-html` / explicit `trusted-html`), but both are still raw `innerHTML` assignments. Under Trusted Types enforcement those assignments throw unless the host installs a `TrustedHTML` policy.

As of this version, **the runtime itself routes `innerHTML` writes through a `czap` Trusted Types policy when `window.trustedTypes` is available** (`packages/web/src/security/html-trust.ts`). If the host has not pre-installed a `czap` policy, the runtime creates a passthrough one on first use — sanitization still runs upstream of the policy callback, so the policy is the Trusted Types attestation, not a second sanitizer.

A host can pre-install a stricter policy if it wants additional belt-and-suspenders behavior:

```ts
// In your application bootstrap, before any LiteShip runtime code runs:
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy('czap', {
    // Input has already been sanitized by the LiteShip trust pipeline at this
    // point (sanitized-html mode); add additional checks here only if you
    // want defense-in-depth on top of the upstream sanitizer.
    createHTML: (input) => input,
  });
}
```

Important caveat: under the `'trusted-html'` policy (caller opted in via `allowTrustedHtml: true`), the sanitizer is skipped — the host's policy callback receives raw caller-asserted markup. If your host installs a passthrough `czap` policy and a downstream caller opts into `'trusted-html'`, you have effectively zero filtering. Either keep callers off `'trusted-html'`, or have your host policy callback do a second sanitize pass for that path.

If the host enforces Trusted Types via the `require-trusted-types-for 'script'` CSP directive, the runtime's policy lookup picks up the host policy automatically. No bootstrap step required for the `sanitized-html` and `text` paths.

### Defaults summary

- LiteShip itself: no `eval`, no `new Function`. Verified across `packages/*/src/` (no production runtime path uses them). The discipline is enforced by code review, not by an ESLint rule today; a follow-up to add `no-eval` and `no-new-func` ESLint rules is on the roadmap.
- LiteShip itself: when `window.trustedTypes` is available, the runtime looks up (or creates a passthrough) `czap` policy automatically. Hosts with stricter requirements pre-install their own.
- LiteShip itself: no auto-set CSP. The host owns the policy.

## Red-team regression suite

The repo includes a dedicated red-team regression lane:

```bash
pnpm run test:redteam
```

It runs as phase 16 of `pnpm run gauntlet:full` (see [STATUS.md](./docs/STATUS.md#gates)) and on every PR through `.github/workflows/ci.yml`. New security-relevant findings should be encoded as a regression test there to prevent re-introduction.

## Disclosure timeline

For accepted vulnerabilities:

1. We acknowledge receipt (≤ 72 hours).
2. We confirm reproducibility and assess severity (≤ 7 days). Severity uses CVSS 3.1 base score bands: Critical 9.0–10.0, High 7.0–8.9, Medium 4.0–6.9, Low 0.1–3.9. Pre-1.0 means we will sometimes resolve a finding with a breaking change instead of a workaround; we'll communicate which path before we ship.
3. We ship a fix or mitigation on a severity-keyed timeline:
   - Critical: ≤ 7 days
   - High: ≤ 14 days
   - Medium: ≤ 30 days
   - Low: addressed in the next regular release cycle
4. We publish a GitHub Security Advisory crediting the reporter (unless they request anonymity), and add a regression to `tests/regression/red-team-runtime.test.ts` so the same shape can't re-enter without a test failure.

For findings we determine are not vulnerabilities (e.g. expected behavior, out-of-scope, host-application responsibility), we'll explain that reasoning in the advisory thread.

## Scope notes

In scope:

- All packages under `@czap/*`
- The Vite plugin, Astro integration, and edge host adapters
- The capsule factory and content-addressing primitives
- The runtime trust gate and HTML sanitization paths

Out of scope (not because they don't matter, but because they're not
LiteShip's published security surface):

- Vulnerabilities in upstream dependencies (please report to those
  maintainers; we'll bump if a fix is available)
- Misconfiguration in consumer applications (e.g. a host app disabling
  the trust gate intentionally)
- Issues in third-party tooling (Vite, Astro, Playwright, vitest)
