import { describe, expect, test } from 'vitest';
import { czapMiddleware } from '@czap/astro';

describe('Astro edge host pipeline integration', () => {
  test('resolves hints, tier, theme, and cached outputs through the middleware host path', async () => {
    const cacheStore = new Map<string, string>();
    const middleware = czapMiddleware({
      edge: {
        theme: ({ tier }) => ({
          prefix: 'brand',
          tokens: {
            'color.primary': tier.designTier,
            'motion.mode': tier.motionTier,
          },
        }),
        cache: {
          kv: {
            async get(key) {
              return cacheStore.get(key) ?? null;
            },
            async put(key, value) {
              cacheStore.set(key, value);
            },
          },
          boundaryId: 'fnv1a:integration-edge' as any,
          compile: ({ tier, theme }) => ({
            css: `${theme?.css ?? ''}\n[data-tier="${tier.designTier}"]{display:block;}`,
            propertyRegistrations: '@property --edge-tier {}',
            containerQueries: '@container edge-size {}',
          }),
        },
      },
    });

    const context = {
      request: new Request('http://localhost/', {
        headers: new Headers({
          'sec-ch-viewport-width': '1280',
          'sec-ch-device-memory': '8',
          'sec-ch-prefers-reduced-motion': 'reduce',
        }),
      }),
      locals: {} as Record<string, unknown>,
    };

    const response = await middleware(context, async () => {
      const czap = context.locals.czap as Record<string, any>;
      return new Response(
        JSON.stringify({
          tier: czap.tier,
          edge: czap.edge,
        }),
        { status: 200 },
      );
    });

    const body = JSON.parse(await response.text()) as {
      readonly tier: { readonly motion: string };
      readonly edge: { readonly theme: { readonly css: string }; readonly compiledOutputs: { readonly css: string } };
    };

    expect(body.tier.motion).toBe('none');
    expect(body.edge.theme.css).toContain('--brand-color-primary');
    expect(body.edge.compiledOutputs.css).toContain('[data-tier=');
    expect(response.headers.get('Accept-CH')).toContain('Sec-CH-Viewport-Width');
    expect(cacheStore.size).toBe(1);
  });
});
