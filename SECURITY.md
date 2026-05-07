# Security Policy

## Reporting a vulnerability

Please **do not** open public GitHub issues for security findings.

Instead, use one of these private channels:

- **GitHub Security Advisory** — preferred. From the repo's "Security"
  tab, click "Report a vulnerability." This creates a private advisory
  visible only to maintainers.
- **Email** — send to the maintainer team via the contact listed on the
  organization profile at
  [github.com/TheFreeBatteryFactory](https://github.com/TheFreeBatteryFactory).

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

czap is pre-1.0. The latest minor release on the `main` branch is the
only supported line. Older versions may receive security fixes at
maintainer discretion if the fix is trivial to backport.

| Version | Supported |
| --- | --- |
| `0.x` (latest minor) | yes |
| Older `0.x` | best-effort backport on request |

## Security posture (summary)

The runtime is hardened around explicit trust boundaries instead of
permissive defaults:

- **Runtime URL allowlist** — runtime URLs are same-origin by default;
  cross-origin requires explicit allowlist policy. SSRF protections reject
  private/link-local IPs even when an allowlist is configured.
- **Artifact ID validation** — IDs are validated as single path segments,
  preventing path-traversal attempts via runtime URL construction.
- **HTML trust pipeline** — stream and LLM HTML flows route through a
  shared trust gate with three modes: `text` (default, no HTML), `sanitized-html`
  (strips executable markup), and explicit `trusted-html` (caller asserts).
- **Theme/CSS sanitization** — theme compilation rejects unsafe prefixes
  (e.g. attempts to escape custom-property scoping) and CSS-breaking token
  values.
- **Boundary state surface** — boundary state application is locked to
  `--czap-*` custom properties, `aria-*`, and `role`. Arbitrary attribute
  injection is rejected.
- **Bootstrap snapshot hardening** — the `__CZAP_DETECT__` snapshot is
  non-enumerable, frozen, and intentionally minimal. Astro integration
  publishes a frozen `__CZAP_RUNTIME_POLICY__` snapshot for runtime
  endpoint and HTML trust decisions.
- **No eval, no new Function** — runtime code does not generate code at
  runtime.

## CSP and Trusted Types

- Runtime code is compatible with strict CSP policies (no `eval`, no
  `new Function`).
- Astro integration injects bootstrap scripts; a strict
  `Content-Security-Policy` requires hashes or nonces at the host layer.
- czap does not auto-install a Trusted Types policy. Host applications
  enforcing Trusted Types should keep routing future HTML sinks through
  the shared runtime trust surfaces rather than ad-hoc DOM writes.

## Red-team regression suite

The repo includes a dedicated red-team regression lane:

```bash
pnpm run test:redteam
```

It runs in the gauntlet and on every PR. New security-relevant findings
should be encoded as a regression test there to prevent re-introduction.

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
czap's surface):

- Vulnerabilities in upstream dependencies (please report to those
  maintainers; we'll bump if a fix is available)
- Misconfiguration in consumer applications (e.g. a host app disabling
  the trust gate intentionally)
- Issues in third-party tooling (Vite, Astro, Playwright, vitest)
