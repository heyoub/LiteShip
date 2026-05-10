// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { parseHTML } from '../../packages/web/src/morph/diff-pure.js';
import { buildUrl } from '../../packages/web/src/stream/sse-pure.js';
import { resolveHtmlString } from '../../packages/web/src/security/html-trust.js';
import { resolveRuntimeUrl } from '../../packages/web/src/security/runtime-url.js';
import { allowSameOriginRuntimeUrl } from '../../packages/astro/src/runtime/url-policy.js';
import { compileTheme } from '../../packages/edge/src/theme-compiler.js';
import { applyBoundaryState, parseBoundary } from '../../packages/astro/src/runtime/boundary.js';
import { captureDiagnostics } from '../helpers/diagnostics.js';

describe('red-team runtime regressions', () => {
  test('sanitizes executable markup from streamed HTML fragments', () => {
    const fragment = parseHTML(
      '<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="/evil"></iframe></div>',
    );
    const container = document.createElement('div');
    container.appendChild(fragment);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.firstElementChild?.getAttribute('onclick')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
  });

  test('rejects traversal-like artifact ids in runtime URLs', () => {
    expect(() => buildUrl('/stream', '../../admin')).toThrow(/Invalid artifactId/);
    expect(() => buildUrl('/stream', '%2e%2e%2fadmin')).toThrow(/Invalid artifactId/);
    expect(() => buildUrl('/stream', 'a/b')).toThrow(/Invalid artifactId/);
    expect(() => buildUrl('/stream', 'doc?x=1')).toThrow(/Invalid artifactId/);
  });

  test('rejects cross-origin runtime URLs by default', () => {
    captureDiagnostics(({ events }) => {
      expect(allowSameOriginRuntimeUrl('https://attacker.example/stream', 'test', 'cross-origin')).toBeNull();
      expect(allowSameOriginRuntimeUrl('/stream', 'test', 'same-origin')).toBe('/stream');
      expect(events).toEqual([
        expect.objectContaining({
          source: 'test',
          code: 'cross-origin',
        }),
      ]);
    });
  });

  test('rejects unsafe theme prefixes and CSS payloads', () => {
    expect(() => compileTheme({ prefix: 'brand bad', tokens: { primary: '#fff' } })).toThrow(/Invalid theme prefix/);
    expect(() => compileTheme({ tokens: { primary: 'red;display:block' } })).toThrow(/Unsafe theme token value/);
  });

  test('sanitized html strips privileged sinks while keeping safe markup', () => {
    const sanitized = resolveHtmlString(
      '<b>ok</b><img src="x" onerror="alert(1)"><svg><script>bad()</script></svg><iframe src="/evil"></iframe><a href="javascript:alert(1)">x</a><div style="background:url(https://attacker.example/x)">body</div>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;

    expect(container.querySelector('b')?.textContent).toBe('ok');
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(container.querySelector('div')?.getAttribute('style')).toBeNull();
  });

  test('runtime URL allowlists are explicit by origin and endpoint kind', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/chat', {
        kind: 'llm',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['https://trusted.example'],
        },
      }).type,
    ).toBe('allowed');

    expect(
      resolveRuntimeUrl('https://trusted.example/shader', {
        kind: 'gpu-shader',
        policy: {
          mode: 'allowlist',
          byKind: { llm: ['https://trusted.example'] },
        },
      }).type,
    ).toBe('kind-not-allowed');

    expect(
      resolveRuntimeUrl('https://evil.example/chat', {
        kind: 'llm',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['https://trusted.example'],
        },
      }).type,
    ).toBe('origin-not-allowed');
  });

  test('rejects private/link-local IPs to prevent SSRF via gpu-shader or allowlist bypass', () => {
    const ssrfTargets = [
      { url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/', origin: 'http://169.254.169.254' },
      { url: 'http://10.0.0.1/internal-api', origin: 'http://10.0.0.1' },
      { url: 'http://192.168.1.1/router-admin', origin: 'http://192.168.1.1' },
      { url: 'http://127.0.0.1:9090/metrics', origin: 'http://127.0.0.1:9090' },
      { url: 'http://[::1]:8080/debug', origin: 'http://[::1]:8080' },
    ];

    for (const { url, origin } of ssrfTargets) {
      const result = resolveRuntimeUrl(url, {
        kind: 'gpu-shader',
        policy: {
          mode: 'allowlist',
          allowOrigins: [origin],
        },
      });
      expect(result.type, `Expected ${url} to be rejected`).toBe('private-ip-rejected');
    }

    // file: protocol blocked separately (no origin to allowlist)
    expect(
      resolveRuntimeUrl('file:///etc/passwd', {
        kind: 'gpu-shader',
        baseOrigin: 'https://app.example.com',
      }).type,
    ).toBe('private-ip-rejected');
  });

  test('allows legitimate CDN URL through allowlist while blocking private IPs', () => {
    expect(
      resolveRuntimeUrl('https://cdn.example.com/shaders/blur.wgsl', {
        kind: 'gpu-shader',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['https://cdn.example.com'],
        },
      }).type,
    ).toBe('allowed');
  });

  test('locks boundary state application to safe styles and aria surfaces', () => {
    const element = document.createElement('div');
    const boundary = parseBoundary(
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0],
        states: ['compact'],
      }),
    );

    expect(boundary).not.toBeNull();

    applyBoundaryState(element, boundary!, {
      discrete: { hero: 'compact' },
      outputs: {
        css: { '--czap-gap': 12, color: 'red' },
        glsl: {},
        aria: { 'aria-hidden': 'true', onclick: 'alert(1)' },
      },
      css: { 'background-image': 'url(https://attacker.example/x)' },
      aria: { style: 'display:none', role: 'status' },
    });

    expect(element.style.getPropertyValue('--czap-gap')).toBe('12');
    expect(element.style.getPropertyValue('color')).toBe('');
    expect(element.style.getPropertyValue('background-image')).toBe('');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('onclick')).toBeNull();
    expect(element.getAttribute('style')).not.toContain('display:none');
  });

  test('strips <base href> origin-hijack vector', () => {
    const sanitized = resolveHtmlString(
      '<p>safe</p><base href="https://attacker.example/"><a href="/relative">link</a>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('base')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('safe');
  });

  test('strips <meta http-equiv> CSP/refresh override', () => {
    const sanitized = resolveHtmlString(
      '<p>ok</p><meta http-equiv="refresh" content="0;url=https://attacker.example/"><meta http-equiv="content-security-policy" content="default-src *">',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('meta')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('ok');
  });

  test('strips <link rel> stylesheet/prefetch injection', () => {
    const sanitized = resolveHtmlString(
      '<p>ok</p><link rel="stylesheet" href="https://attacker.example/evil.css"><link rel="prefetch" href="https://attacker.example/track">',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('link')).toBeNull();
  });

  test('strips <form> with javascript: action and formaction', () => {
    const sanitized = resolveHtmlString(
      '<form action="javascript:alert(1)"><button formaction="javascript:alert(2)">go</button></form>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('form')).toBeNull();
  });

  test('strips <noscript> mXSS re-serialization vector', () => {
    const sanitized = resolveHtmlString(
      '<p>ok</p><noscript><img src="x" onerror="alert(1)"></noscript>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('noscript')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('ok');
  });

  test('strips javascript: in formaction/action/ping attributes on surviving elements', () => {
    const sanitized = resolveHtmlString(
      '<a href="/safe" ping="javascript:alert(1)">link</a><button formaction="javascript:alert(2)">x</button>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('a')?.getAttribute('ping')).toBeNull();
    expect(container.querySelector('button')?.getAttribute('formaction')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/safe');
  });

  test('strips data: javascript variants on url-sink attributes', () => {
    const sanitized = resolveHtmlString(
      '<a href="data:application/x-javascript,alert(1)">x</a><iframe src="data:text/javascript,alert(2)"></iframe>',
      { policy: 'sanitized-html' },
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
