# Security Policy

## Reporting a vulnerability

Please do not open public GitHub issues for security findings.

Instead, use one of these private channels:

- **GitHub Security Advisory** (preferred). From the repo's "Security" tab, click "Report a vulnerability." This creates a private advisory visible only to maintainers.
- **Email**: send to the maintainer team via the contact listed on the organization profile at [github.com/TheFreeBatteryFactory](https://github.com/TheFreeBatteryFactory).

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

- **Runtime URL allowlist.** Runtime URLs are same-origin by default; cross-origin requires explicit allowlist policy before the line is run. SSRF protections reject private/link-local IPs even when an allowlist is configured.
- **Artifact ID validation.** IDs are validated as single path segments, preventing path-traversal attempts via runtime URL construction.
- **HTML trust pipeline.** Stream and LLM HTML flows route through a shared trust gate with three modes: `text` (default, no HTML), `sanitized-html` (strips executable markup), and explicit `trusted-html` (caller asserts).
- **Theme/CSS sanitization.** Theme compilation rejects unsafe prefixes (e.g. attempts to escape custom-property scoping) and CSS-breaking token values.
- **Boundary state surface.** Boundary state application is locked to `--czap-*` custom properties, `aria-*`, and `role`. Arbitrary attribute injection is rejected.
- **Bootstrap snapshot hardening.** The `__CZAP_DETECT__` snapshot is non-enumerable, frozen, and intentionally minimal. Astro integration publishes a frozen `__CZAP_RUNTIME_POLICY__` snapshot for runtime endpoint and HTML trust decisions.
- **No eval, no new Function.** The runtime does not generate code at voyage time.

## CSP and Trusted Types

Runtime code is compatible with strict CSP policies in the sense that LiteShip itself does not call `eval` or `new Function`. Deploying under strict CSP still requires the host to make several deliberate decisions, and LiteShip does not abstract them.

### Required directives for a host CSP

- `script-src`: Astro injects bootstrap scripts. The host must add per-request hashes or nonces. There is no built-in nonce-threading API; the host plumbs the nonce into the Astro integration and keeps it consistent with the response header.
- `worker-src`: the off-thread compositor, render worker, and audio processor are spawned from `blob:` URLs (`packages/worker/src/compositor-startup.ts`, `packages/worker/src/render-worker.ts`, `packages/web/src/audio/processor-bootstrap.ts`). A policy of `worker-src 'self'` will silently fail these workers; the host needs `worker-src blob:` (or `worker-src 'self' blob:`) for the off-thread paths to start. This is a real deployment-time decision, not a default we can ship for you.
- `connect-src`: SSE and LLM endpoints. The host's allowlist policy (see "Runtime URL allowlist" above) must agree with the CSP `connect-src` list.

### Trusted Types

LiteShip writes to `innerHTML` in two sanctioned places: the templated HTML-fragment helper in `packages/web/src/morph/html-trust.ts` and the LLM session HTML sink at `packages/astro/src/runtime/llm-session.ts`. Both are gated by the shared trust pipeline (`text` / `sanitized-html` / explicit `trusted-html`), but both are still raw `innerHTML` assignments. Under Trusted Types enforcement those assignments throw unless the host installs a `TrustedHTML` policy.

A minimal host-side recipe:

```ts
// In your application bootstrap, before any LiteShip runtime code runs:
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy('czap', {
    createHTML: (input) => input, // input is already sanitized by the LiteShip trust pipeline
  });
}
```

The policy name `czap` is what the runtime expects. The trust pipeline does the actual sanitization upstream of the policy callback; the policy is the Trusted Types attestation, not a second sanitizer.

If the host enforces Trusted Types via the `require-trusted-types-for 'script'` CSP directive, install the policy first or the runtime will throw on first HTML projection.

### Defaults summary

- LiteShip itself: no `eval`, no `new Function`. Verified across `packages/*/src/` (no production runtime path uses them). The discipline is enforced by code review, not by an ESLint rule today; a follow-up to add `no-eval` and `no-new-func` ESLint rules is on the roadmap.
- LiteShip itself: no auto-installed Trusted Types policy. The recipe above is the supported integration path.
- LiteShip itself: no auto-set CSP. The host owns the policy.

## Red-team regression suite

The repo includes a dedicated red-team regression lane:

```bash
pnpm run test:redteam
```

It runs as phase 16 of `pnpm run gauntlet:full` (see [STATUS.md](./docs/STATUS.md#gates)) and on every PR through `.github/workflows/ci.yml`. New security-relevant findings should be encoded as a regression test there to prevent re-introduction.

## Disclosure timeline

For accepted vulnerabilities:

1. We acknowledge receipt (≤ 72 hours)
2. We confirm reproducibility and assess severity (≤ 7 days)
3. We ship a fix or mitigation (≤ 14 days for high-severity)
4. We publish a GitHub Security Advisory crediting the reporter (unless
   they request anonymity)

For findings we determine are not vulnerabilities (e.g. expected behavior,
out-of-scope, host-application responsibility), we'll explain that
reasoning in the advisory thread.

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
