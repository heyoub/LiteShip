// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Diagnostics } from '@czap/core';
import { allowRuntimeEndpointUrl, allowSameOriginRuntimeUrl, isSameOriginRuntimeUrl } from '../../../packages/astro/src/runtime/url-policy.js';
import { isPrivateOrReservedIP, resolveRuntimeUrl } from '../../../packages/web/src/security/runtime-url.js';
import {
  createHtmlFragment,
  resolveHtmlString,
  sanitizeHTML,
} from '../../../packages/web/src/security/html-trust.js';

describe('runtime security helpers', () => {
  beforeEach(() => {
    Diagnostics.reset();
  });

  afterEach(() => {
    Diagnostics.reset();
  });

  test('runtime endpoint url helpers cover allowed, missing, malformed, allowlist, and kind-restricted paths', () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    expect(allowRuntimeEndpointUrl(null, 'stream', 'test')).toBeNull();
    expect(allowRuntimeEndpointUrl('/stream', 'stream', 'test')).toBe('/stream');
    expect(allowRuntimeEndpointUrl('http://%', 'stream', 'test', { malformedUrl: 'bad-url' })).toBeNull();

    expect(
      allowRuntimeEndpointUrl(
        'https://elsewhere.example/chat',
        'llm',
        'test',
        undefined,
        {
          mode: 'allowlist',
          allowOrigins: ['https://trusted.example'],
        },
      ),
    ).toBeNull();

    expect(
      allowRuntimeEndpointUrl(
        'https://trusted.example/shader',
        'gpu-shader',
        'test',
        undefined,
        {
          mode: 'allowlist',
          byKind: {
            llm: ['https://trusted.example'],
          },
        },
      ),
    ).toBeNull();

    expect(allowSameOriginRuntimeUrl('/feed', 'test', 'same-origin')).toBe('/feed');
    expect(allowSameOriginRuntimeUrl('https://evil.example/feed', 'test', 'cross-origin')).toBeNull();
    expect(isSameOriginRuntimeUrl('/feed')).toBe(true);
    expect(isSameOriginRuntimeUrl('https://evil.example/feed')).toBe(false);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'bad-url' }),
        expect.objectContaining({ code: 'llm-origin-not-allowed' }),
        expect.objectContaining({ code: 'gpu-shader-endpoint-kind-not-permitted' }),
        expect.objectContaining({ code: 'cross-origin' }),
      ]),
    );
  });

  test('runtime URL resolution preserves malformed failure context', () => {
    expect(
      resolveRuntimeUrl('http://%', {
        kind: 'stream',
        baseOrigin: 'http://localhost',
      }),
    ).toEqual({
      type: 'malformed',
      rawUrl: 'http://%',
      baseOrigin: 'http://localhost',
      reason: 'url-can-parse-rejected',
    });
  });

  test('runtime URL resolution returns missing when no URL is provided', () => {
    expect(
      resolveRuntimeUrl(undefined, {
        kind: 'stream',
        baseOrigin: 'http://localhost',
      }),
    ).toEqual({ type: 'missing' });
  });

  test('runtime URL resolution defaults allowlist policy mode to same-origin when mode is omitted', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/stream', {
        kind: 'stream',
        baseOrigin: 'http://localhost',
        policy: {
          allowOrigins: ['https://trusted.example'],
        },
      }),
    ).toEqual({
      type: 'cross-origin-rejected',
      resolved: new URL('https://trusted.example/stream'),
    });
  });

  test('runtime URL resolution allows cross-origin URLs through per-kind allowlists', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/llm', {
        kind: 'llm',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          byKind: {
            llm: ['https://trusted.example'],
          },
        },
      }),
    ).toEqual({
      type: 'allowed',
      url: 'https://trusted.example/llm',
      resolved: new URL('https://trusted.example/llm'),
    });
  });

  test('runtime URL resolution allows cross-origin URLs through global allowlists', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/snapshot', {
        kind: 'snapshot',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['https://trusted.example'],
        },
      }),
    ).toEqual({
      type: 'allowed',
      url: 'https://trusted.example/snapshot',
      resolved: new URL('https://trusted.example/snapshot'),
    });
  });

  test('runtime URL resolution normalizes allowlist origins and default ports before matching', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example:443/llm', {
        kind: 'llm',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          allowOrigins: [' HTTPS://TRUSTED.EXAMPLE:443 '],
        },
      }),
    ).toEqual({
      type: 'allowed',
      url: 'https://trusted.example:443/llm',
      resolved: new URL('https://trusted.example:443/llm'),
    });
  });

  test('runtime URL resolution ignores malformed allowlist origins and falls back to origin rejection', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/llm', {
        kind: 'llm',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['%%%not-an-origin%%%'],
        },
      }),
    ).toEqual({
      type: 'origin-not-allowed',
      resolved: new URL('https://trusted.example/llm'),
    });
  });

  test('runtime URL resolution treats unrelated kind rules as an explicit kind mismatch', () => {
    expect(
      resolveRuntimeUrl('https://trusted.example/shader', {
        kind: 'gpu-shader',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          byKind: {
            llm: ['https://trusted.example'],
          },
        },
      }),
    ).toEqual({
      type: 'kind-not-allowed',
      resolved: new URL('https://trusted.example/shader'),
    });
  });

  test('runtime URL resolution accepts same-origin absolute URLs after origin normalization', () => {
    expect(
      resolveRuntimeUrl('https://app.example.com:443/stream', {
        kind: 'stream',
        baseOrigin: 'HTTPS://APP.EXAMPLE.COM',
      }),
    ).toEqual({
      type: 'allowed',
      url: 'https://app.example.com:443/stream',
      resolved: new URL('https://app.example.com:443/stream'),
    });
  });

  test('runtime URL resolution preserves constructor-thrown malformed detail for Error and non-Error failures', () => {
    const originalURL = globalThis.URL;

    class ThrowingErrorURL {
      static canParse(_rawUrl: string, _base?: string): boolean {
        return true;
      }

      constructor() {
        throw new Error('bad constructor');
      }
    }

    class ThrowingStringURL {
      static canParse(_rawUrl: string, _base?: string): boolean {
        return true;
      }

      constructor() {
        throw 'bad string failure';
      }
    }

    try {
      globalThis.URL = ThrowingErrorURL as unknown as typeof URL;
      expect(
        resolveRuntimeUrl('http://%', {
          kind: 'stream',
          baseOrigin: 'http://localhost',
        }),
      ).toEqual({
        type: 'malformed',
        rawUrl: 'http://%',
        baseOrigin: 'http://localhost',
        reason: 'url-constructor-threw',
        detail: 'bad constructor',
      });

      globalThis.URL = ThrowingStringURL as unknown as typeof URL;
      expect(
        resolveRuntimeUrl('http://%', {
          kind: 'stream',
          baseOrigin: 'http://localhost',
        }),
      ).toEqual({
        type: 'malformed',
        rawUrl: 'http://%',
        baseOrigin: 'http://localhost',
        reason: 'url-constructor-threw',
        detail: 'bad string failure',
      });
    } finally {
      globalThis.URL = originalURL;
    }
  });

  test('runtime URL resolution falls back to URL.canParse when URL.parse is unavailable', () => {
    const OriginalURL = globalThis.URL;

    class CanParseOnlyURL {
      static canParse(rawUrl: string, base?: string): boolean {
        return OriginalURL.canParse(rawUrl, base);
      }

      readonly origin: string;
      readonly protocol: string;
      readonly hostname: string;
      readonly href: string;

      constructor(rawUrl: string, base?: string) {
        const parsed = new OriginalURL(rawUrl, base);
        this.origin = parsed.origin;
        this.protocol = parsed.protocol;
        this.hostname = parsed.hostname;
        this.href = parsed.href;
      }

      toString(): string {
        return this.href;
      }
    }

    try {
      globalThis.URL = CanParseOnlyURL as unknown as typeof URL;
      expect(
        resolveRuntimeUrl('https://trusted.example/stream', {
          kind: 'stream',
          baseOrigin: 'https://trusted.example',
        }),
      ).toEqual({
        type: 'allowed',
        url: 'https://trusted.example/stream',
        resolved: expect.objectContaining({
          origin: 'https://trusted.example',
          hostname: 'trusted.example',
          protocol: 'https:',
        }),
      });
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  test('runtime URL resolution exercises URL.canParse fallback with a malformed allowlist origin when URL.parse is unavailable', () => {
    const OriginalURL = globalThis.URL;

    class CanParseOnlyURL2 {
      static canParse(rawUrl: string, base?: string): boolean {
        return OriginalURL.canParse(rawUrl, base);
      }

      readonly origin: string;
      readonly protocol: string;
      readonly hostname: string;
      readonly href: string;

      constructor(rawUrl: string, base?: string) {
        const parsed = new OriginalURL(rawUrl, base);
        this.origin = parsed.origin;
        this.protocol = parsed.protocol;
        this.hostname = parsed.hostname;
        this.href = parsed.href;
      }

      toString(): string {
        return this.href;
      }
    }

    try {
      globalThis.URL = CanParseOnlyURL2 as unknown as typeof URL;
      const result = resolveRuntimeUrl('https://other.example/stream', {
        kind: 'stream',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['%%%not-a-url%%%'],
        },
      });
      expect(result).toEqual({
        type: 'origin-not-allowed',
        resolved: expect.objectContaining({
          hostname: 'other.example',
        }),
      });
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  test('parseAbsoluteUrl returns null for normalized allowlist origins when both URL.parse and URL.canParse are absent', () => {
    const OriginalURL = globalThis.URL;

    class LegacyURL {
      readonly origin: string;
      readonly protocol: string;
      readonly hostname: string;
      readonly href: string;

      constructor(rawUrl: string, base?: string) {
        const parsed = new OriginalURL(rawUrl, base);
        this.origin = parsed.origin;
        this.protocol = parsed.protocol;
        this.hostname = parsed.hostname;
        this.href = parsed.href;
      }

      toString(): string {
        return this.href;
      }
    }

    try {
      globalThis.URL = LegacyURL as unknown as typeof URL;
      // With no URL.parse and no URL.canParse, normalizeOriginAllowlist cannot
      // normalize the configured origin, so the allowlist effectively collapses
      // to `[]` and the request falls through to origin-not-allowed.
      const result = resolveRuntimeUrl('https://other.example/stream', {
        kind: 'stream',
        baseOrigin: 'http://localhost',
        policy: {
          mode: 'allowlist',
          allowOrigins: ['https://other.example'],
        },
      });
      expect(result).toEqual({
        type: 'origin-not-allowed',
        resolved: expect.objectContaining({
          hostname: 'other.example',
        }),
      });
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  test('isPrivateOrReservedIP detects all private and reserved ranges', () => {
    // IPv4 private ranges
    expect(isPrivateOrReservedIP('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('127.255.255.255')).toBe(true);
    expect(isPrivateOrReservedIP('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('10.255.255.255')).toBe(true);
    expect(isPrivateOrReservedIP('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIP('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIP('192.168.255.255')).toBe(true);
    expect(isPrivateOrReservedIP('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIP('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('239.1.2.3')).toBe(true);
    expect(isPrivateOrReservedIP('255.255.255.255')).toBe(true);
    expect(isPrivateOrReservedIP('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIP('localhost')).toBe(true);

    // IPv6 private/reserved
    expect(isPrivateOrReservedIP('::')).toBe(true);
    expect(isPrivateOrReservedIP('::1')).toBe(true);
    expect(isPrivateOrReservedIP('[::1]')).toBe(true);
    expect(isPrivateOrReservedIP('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIP('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIP('fd12:3456::1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:0.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('[::ffff:10.0.0.1]')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:169.254.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:224.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:7f00:1')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:0000:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:0a00:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:6440:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:ac10:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:c0a8:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:a9fe:0001')).toBe(true);
    expect(isPrivateOrReservedIP('::ffff:e000:0001')).toBe(true);

    // Public IPs should NOT be flagged
    expect(isPrivateOrReservedIP('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIP('100.128.0.1')).toBe(false);
    expect(isPrivateOrReservedIP('172.32.0.1')).toBe(false);
    expect(isPrivateOrReservedIP('192.169.1.1')).toBe(false);
    expect(isPrivateOrReservedIP('::ffff:8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIP('::ffff:0808:0808')).toBe(false);
    expect(isPrivateOrReservedIP('::ffff:999.0.0.1')).toBe(false);
    expect(isPrivateOrReservedIP('cdn.example.com')).toBe(false);
  });

  test('resolveRuntimeUrl rejects absolute URLs targeting private/reserved IPs', () => {
    const opts = { kind: 'gpu-shader' as const, baseOrigin: 'https://app.example.com' };

    expect(resolveRuntimeUrl('http://169.254.169.254/latest/meta-data', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://10.0.0.1/internal', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://192.168.1.1/admin', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://127.0.0.1:8080/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://localhost:3000/api', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://100.64.0.1/internal', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://239.0.0.1/internal', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:127.0.0.1]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:7f00:1]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('file:///etc/passwd', opts).type).toBe('private-ip-rejected');
  });

  test('resolveRuntimeUrl rejects hex-mapped IPv6 private and reserved absolute URLs', () => {
    const opts = { kind: 'gpu-shader' as const, baseOrigin: 'https://app.example.com' };

    expect(resolveRuntimeUrl('http://[::ffff:0000:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:0a00:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:6440:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:ac10:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:c0a8:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:a9fe:0001]/secret', opts).type).toBe('private-ip-rejected');
    expect(resolveRuntimeUrl('http://[::ffff:e000:0001]/secret', opts).type).toBe('private-ip-rejected');
  });

  test('resolveRuntimeUrl allows legitimate external URLs', () => {
    expect(
      resolveRuntimeUrl('https://cdn.example.com/shader.wgsl', {
        kind: 'gpu-shader',
        baseOrigin: 'https://cdn.example.com',
      }).type,
    ).toBe('allowed');
  });

  test('allowRuntimeEndpointUrl rejects private IP targets even when they appear in an allowlist', () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    expect(
      allowRuntimeEndpointUrl(
        'http://192.168.1.1/api',
        'stream',
        'test',
        undefined,
        {
          mode: 'allowlist',
          allowOrigins: ['http://192.168.1.1'],
        },
      ),
    ).toBeNull();

    expect(events).toContainEqual(
      expect.objectContaining({
        source: 'test',
        code: 'stream-private-ip-rejected',
      }),
    );
  });

  test('resolveRuntimeUrl uses window location origin when baseOrigin is omitted or null-like', () => {
    expect(
      resolveRuntimeUrl('/stream', {
        kind: 'stream',
        baseOrigin: 'null',
      }).type,
    ).toBe('allowed');
  });

  test('resolveRuntimeUrl falls back to localhost when neither baseOrigin nor location origin is usable', () => {
    const originalLocation = globalThis.location;

    try {
      vi.stubGlobal('location', { origin: 'null' });
      expect(resolveRuntimeUrl('/stream', { kind: 'stream' })).toEqual({
        type: 'allowed',
        url: '/stream',
        resolved: new URL('http://localhost/stream'),
      });
    } finally {
      vi.stubGlobal('location', originalLocation);
    }
  });

  test('resolveRuntimeUrl falls back to lowercased baseOrigin when origin normalization cannot parse it', () => {
    const OriginalURL = globalThis.URL;

    class FallbackOriginURL {
      static canParse(): boolean {
        return true;
      }

      readonly origin: string;
      readonly protocol = 'http:';
      readonly hostname = 'example.test';
      readonly href: string;

      constructor(raw: string, base?: string) {
        if (base === undefined) {
          throw new Error('unparseable origin');
        }

        this.origin = base.toLowerCase();
        this.href = `${base}${raw}`;
      }

      toString(): string {
        return this.href;
      }
    }

    try {
      globalThis.URL = FallbackOriginURL as unknown as typeof URL;
      expect(
        resolveRuntimeUrl('/stream', {
          kind: 'stream',
          baseOrigin: 'NOT-A-URL',
        }),
      ).toEqual({
        type: 'allowed',
        url: '/stream',
        resolved: expect.objectContaining({ origin: 'not-a-url' }),
      });
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  test('resolveRuntimeUrl still allows same-origin relative paths in localhost dev environments', () => {
    expect(
      resolveRuntimeUrl('/stream', {
        kind: 'stream',
        baseOrigin: 'http://localhost',
      }).type,
    ).toBe('allowed');
  });

  test('html trust helpers cover text, sanitized, and trusted html branches', () => {
    expect(resolveHtmlString('<b>hello</b>', { policy: 'text' })).toBe('&lt;b&gt;hello&lt;/b&gt;');

    const downgraded = resolveHtmlString('<b>safe</b><script>bad()</script><div style="color:red">x</div>', {
      policy: 'trusted-html',
      allowTrustedHtml: false,
    });
    const trusted = resolveHtmlString('<b>safe</b><div style="color:red">x</div>', {
      policy: 'trusted-html',
      allowTrustedHtml: true,
    });
    const sanitized = sanitizeHTML(
      '<iframe src="/evil"></iframe><a href="data:text/html,boom">x</a><div srcdoc="boom" style="display:none">body</div>',
    );

    const downgradedRoot = document.createElement('div');
    downgradedRoot.innerHTML = downgraded;
    expect(downgradedRoot.querySelector('script')).toBeNull();
    expect(downgradedRoot.querySelector('div')?.getAttribute('style')).toBeNull();

    const trustedRoot = document.createElement('div');
    trustedRoot.innerHTML = trusted;
    expect(trustedRoot.querySelector('b')?.textContent).toBe('safe');
    expect(trustedRoot.querySelector('div')?.getAttribute('style')).toBe('color:red');

    const sanitizedRoot = document.createElement('div');
    sanitizedRoot.innerHTML = sanitized;
    expect(sanitizedRoot.querySelector('iframe')).toBeNull();
    expect(sanitizedRoot.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(sanitizedRoot.querySelector('div')?.getAttribute('srcdoc')).toBeNull();
    expect(sanitizedRoot.querySelector('div')?.getAttribute('style')).toBeNull();

    const fragment = createHtmlFragment('<svg><script>bad()</script></svg><p>ok</p>', {
      policy: 'sanitized-html',
    });
    const fragmentRoot = document.createElement('div');
    fragmentRoot.appendChild(fragment);
    expect(fragmentRoot.querySelector('svg')).toBeNull();
    expect(fragmentRoot.querySelector('p')?.textContent).toBe('ok');
  });

  test('html trust defaults to sanitized html and only strips executable URL schemes on sensitive attributes', () => {
    const fragment = createHtmlFragment(
      '<div onclick="boom()" data-url="javascript:allowed-as-data"></div><img src="data:text/html,boom">',
    );
    const root = document.createElement('div');
    root.appendChild(fragment);

    expect(root.querySelector('div')?.getAttribute('onclick')).toBeNull();
    expect(root.querySelector('div')?.getAttribute('data-url')).toBe('javascript:allowed-as-data');
    expect(root.querySelector('img')?.getAttribute('src')).toBeNull();
  });
});
