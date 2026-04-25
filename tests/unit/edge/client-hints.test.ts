/**
 * ClientHints -- Client Hints header parsing tests.
 */

import { describe, test, expect } from 'vitest';
import { ClientHints } from '@czap/edge';

describe('ClientHints', () => {
  test('parseClientHints returns conservative defaults for empty headers', () => {
    const caps = ClientHints.parseClientHints({});
    expect(caps.memory).toBe(4);
    expect(caps.devicePixelRatio).toBe(1);
    expect(caps.viewportWidth).toBe(1920);
    expect(caps.viewportHeight).toBe(1080);
    expect(caps.prefersReducedMotion).toBe(false);
    expect(caps.prefersColorScheme).toBe('light');
    expect(caps.touchPrimary).toBe(false);
    expect(caps.webgpu).toBe(false);
    expect(caps.cores).toBe(4);
    expect(caps.gpu).toBe(1);
    expect(caps.connection?.effectiveType).toBe('4g');
    expect(caps.connection?.saveData).toBe(false);
  });

  test('parseClientHints reads memory hint and clamps to valid bucket', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-device-memory': '3',
    });
    // 3 is closest to 2 or 4 — equidistant, 4 wins in the loop
    expect([2, 4]).toContain(caps.memory);
  });

  test('parseClientHints reads exact memory bucket', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-device-memory': '8',
    });
    expect(caps.memory).toBe(8);
  });

  test('parseClientHints reads DPR', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-dpr': '2.5',
    });
    expect(caps.devicePixelRatio).toBe(2.5);
  });

  test('parseClientHints reads viewport dimensions', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-viewport-width': '768',
      'sec-ch-viewport-height': '1024',
    });
    expect(caps.viewportWidth).toBe(768);
    expect(caps.viewportHeight).toBe(1024);
  });

  test('parseClientHints reads reduced motion preference', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-prefers-reduced-motion': 'reduce',
    });
    expect(caps.prefersReducedMotion).toBe(true);
  });

  test('parseClientHints reads quoted reduced motion preference', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-prefers-reduced-motion': '"reduce"',
    });
    expect(caps.prefersReducedMotion).toBe(true);
  });

  test('parseClientHints reads dark color scheme', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-prefers-color-scheme': 'dark',
    });
    expect(caps.prefersColorScheme).toBe('dark');
  });

  test('parseClientHints reads mobile hint', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-ua-mobile': '?1',
    });
    expect(caps.touchPrimary).toBe(true);
  });

  test('parseClientHints reads save-data', () => {
    const caps = ClientHints.parseClientHints({
      'save-data': 'on',
    });
    expect(caps.connection?.saveData).toBe(true);
  });

  test('parseClientHints reads downlink and ect', () => {
    const caps = ClientHints.parseClientHints({
      downlink: '1.5',
      ect: '3g',
    });
    expect(caps.connection?.downlink).toBe(1.5);
    expect(caps.connection?.effectiveType).toBe('3g');
  });

  test('parseClientHints handles malformed numeric headers', () => {
    const caps = ClientHints.parseClientHints({
      'sec-ch-dpr': 'not-a-number',
      'sec-ch-viewport-width': '',
    });
    expect(caps.devicePixelRatio).toBe(1); // default
    expect(caps.viewportWidth).toBe(1920); // default
  });

  test('parseClientHints works with Headers-like object', () => {
    const headers = new Headers();
    headers.set('sec-ch-dpr', '3');
    headers.set('sec-ch-viewport-width', '414');
    const caps = ClientHints.parseClientHints(headers);
    expect(caps.devicePixelRatio).toBe(3);
    expect(caps.viewportWidth).toBe(414);
  });

  test('acceptCHHeader returns comma-separated hint names', () => {
    const header = ClientHints.acceptCHHeader();
    expect(header).toContain('Sec-CH-Device-Memory');
    expect(header).toContain('Sec-CH-DPR');
    expect(header).toContain('ECT');
  });

  test('criticalCHHeader returns subset of hints', () => {
    const header = ClientHints.criticalCHHeader();
    expect(header).toContain('Sec-CH-Prefers-Reduced-Motion');
    expect(header).toContain('Sec-CH-Device-Memory');
    // ECT is not critical
    expect(header).not.toContain('ECT');
  });

  test('GPU tier heuristic returns 0 for feature phones', () => {
    const caps = ClientHints.parseClientHints({
      'user-agent': 'Mozilla/5.0 (Mobile; Nokia 8110; KaiOS/2.5)',
    });
    expect(caps.gpu).toBe(0);
  });

  test('GPU tier heuristic returns 2 for high-end desktop', () => {
    const caps = ClientHints.parseClientHints({
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    expect(caps.gpu).toBe(2);
  });

  test('covers getter-based inputs, high-end mobile heuristics, and invalid ECT fallbacks', () => {
    const getterOnly = {
      get(name: string) {
        const table: Record<string, string> = {
          'sec-ch-dpr': '2',
          ect: 'wifi',
          'user-agent': 'Mozilla/5.0 (iPhone 15; CPU iPhone OS 18_0 like Mac OS X)',
        };
        return table[name.toLowerCase()] ?? null;
      },
    } as Headers;

    const caps = ClientHints.parseClientHints(getterOnly);
    expect(caps.devicePixelRatio).toBe(2);
    expect(caps.connection?.effectiveType).toBe('4g');
    expect(caps.gpu).toBe(2);
  });

  test('normalizes object maps with undefined entries and covers samsung plus desktop gpu heuristics', () => {
    const mobileCaps = ClientHints.parseClientHints({
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S24 Ultra)',
      'sec-ch-dpr': undefined,
      ECT: '5g',
    });
    expect(mobileCaps.gpu).toBe(2);
    expect(mobileCaps.devicePixelRatio).toBe(1);
    expect(mobileCaps.connection?.effectiveType).toBe('4g');

    const desktopCaps = ClientHints.parseClientHints({
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4)',
    });
    expect(desktopCaps.gpu).toBe(2);
  });

  test('GPU tier heuristic falls back to low-mid for ordinary desktop user agents without premium hints', () => {
    const caps = ClientHints.parseClientHints({
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    });
    expect(caps.gpu).toBe(1);
  });
});
