# Hosting LiteShip — first-hour checklist

LiteShip runs inside the host application's security boundary: the host's CSP, the host's Trusted Types policy, the host's runtime endpoints. This page is the **minimum host checklist** to get a v0.1.x install through its first page render without surprises.

For the security architecture this checklist enforces, see [SECURITY.md](../SECURITY.md). For an end-to-end tutorial, see [docs/GETTING-STARTED.md](./GETTING-STARTED.md).

## Minimum versions

| Tool | Version | Why |
| --- | --- | --- |
| Node | `>= 22` | Built-in `crypto.subtle`, modern stream primitives, `import.meta.dirname` |
| pnpm | `>= 10` | Workspace protocol behavior, `pnpm-workspace.yaml` settings discipline |
| Vite | `8.x` | The `@czap/vite` plugin targets Vite 8's plugin API |
| Astro | `6.x` | The `@czap/astro` integration targets Astro 6's middleware + bootstrap surface |

## Required CSP directives

```
worker-src 'self' blob:
connect-src 'self' https://<your-SSE-or-LLM-endpoints>
script-src  'self' 'nonce-<per-request>'        # nonce threaded by your host
```

If you enforce Trusted Types: also add `require-trusted-types-for 'script'`. The runtime auto-creates a `czap` policy on first use; pre-install only if you want stricter behavior than the upstream sanitizer (see Failure 3 below).

## Five hour-one failures (and how to fix them)

### 1. Off-thread workers silently never start

**Symptom:** Compositor reports inert, no rendering happens off-thread, no error in the page console.

**Cause:** CSP `worker-src 'self'` blocks the `blob:`-URL worker bootstrap. The compositor, render worker, and audio processor are all spawned from inline `Blob` objects.

**Fix:** Add `blob:` to `worker-src` (`worker-src 'self' blob:`). The `blob:` source is a wildcard for any blob the page can construct — see SECURITY.md §worker-src for the threat-model tradeoff and the future packaging mode that avoids it.

### 2. SSE/LLM connection refused

**Symptom:** Stream session opens but never receives messages; browser console shows `Refused to connect to 'https://...' because it violates the following Content Security Policy directive: "connect-src 'self'"`.

**Cause:** Your runtime endpoint isn't in `connect-src`, or it is but isn't in LiteShip's runtime-URL allowlist policy.

**Fix:** Two places must agree:
1. CSP `connect-src` must include the endpoint origin.
2. The runtime URL allowlist policy (configured via the Astro integration or `policy` field on the runtime session) must include the cross-origin endpoint. Same-origin is allowed by default; cross-origin is opt-in. See SECURITY.md §Runtime URL allowlist.

Note that the hostname blocklist rejects literal private-IP strings (`127.0.0.1`, `10.x.x.x`, etc.) but does **not** rewrite hostnames that resolve to private IPs. For DNS-rebinding defense, restrict outbound DNS at the network layer.

### 3. `innerHTML` throws under Trusted Types

**Symptom:** `TypeError: Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment` thrown during LLM HTML render or DOM morph.

**Cause:** Host installed `require-trusted-types-for 'script'` but no `czap` policy exists yet.

**Fix:** Two options:

- **Default (recommended):** Do nothing. The runtime detects `window.trustedTypes` and auto-creates a passthrough `czap` policy on first use. The sanitizer (`sanitized-html` mode) has already run upstream of the policy callback — the policy is the Trusted Types attestation, not a second sanitizer.

- **Host-installed stricter policy:** If you want defense-in-depth, install before any LiteShip code runs:

  ```ts
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    window.trustedTypes.createPolicy('czap', {
      createHTML: (input) => {
        // Input has already been sanitized upstream. Add second-pass checks
        // here only if you've audited what the sanitizer leaves through.
        return input;
      },
    });
  }
  ```

**Caveat:** Callers can opt into `'trusted-html'` mode (`allowTrustedHtml: true`), which **bypasses the sanitizer**. If your host policy is passthrough and a caller opts into `'trusted-html'`, you have effectively zero filtering on that path. Either keep callers off `'trusted-html'` or have your policy callback sanitize defensively.

### 4. Bootstrap snapshot or runtime policy seems "forgotten"

**Symptom:** After HMR reload or test reset, the runtime policy isn't picked up.

**Cause:** The runtime policy lives in two places: a module-private store (canonical) and a frozen `window.__CZAP_RUNTIME_POLICY__` (cross-bundle broadcast, locked at first publish). HMR re-bootstraps the module-private store; the window broadcast stays frozen.

**Fix:** This is intentional. Reads check the module-private store first. If you're seeing stale state in a test, the test harness needs to call the runtime-policy reset path, not just clear the window broadcast. See `packages/astro/src/runtime/policy.ts`.

### 5. Boundary doesn't re-evaluate after edit

**Symptom:** You changed a boundary's threshold or values, but the cached output didn't change.

**Cause:** Boundary identity is content-addressed (ADR-0003 — FNV-1a over canonical CBOR). Identity is over the *definition*, not the source location. Edits that don't change the canonical encoding (e.g. reordering keys, renaming a local variable) yield the same hash, and the cache holds.

**Fix:** This is intended. If you actually changed the definition, the hash changes and downstream work re-fires. If you didn't, no work happens — that's the cache doing its job. To force a recompute, change a definition field rather than rearranging unchanged data.

## Where to look next

- [SECURITY.md](../SECURITY.md) — full security posture, allowlist details, sanitizer reference
- [docs/GETTING-STARTED.md](./GETTING-STARTED.md) — install → hello-world boundary → cast to CSS → hydrate through Astro
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — module DAG and projection pipeline
- [docs/RELEASING.md](./RELEASING.md) — release flow for maintainers (ADR-0011 ShipCapsules)
