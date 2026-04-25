/**
 * EdgeTier -- edge-side tier detection from Client Hints headers.
 */

import { describe, test, expect } from 'vitest';
import { EdgeTier } from '@czap/edge';

describe('EdgeTier', () => {
  test('detectTier returns all three tier axes', () => {
    const result = EdgeTier.detectTier({});
    expect(result).toHaveProperty('capLevel');
    expect(result).toHaveProperty('motionTier');
    expect(result).toHaveProperty('designTier');
  });

  test('detectTier with reduced motion yields none motion tier', () => {
    const result = EdgeTier.detectTier({
      'sec-ch-prefers-reduced-motion': 'reduce',
    });
    expect(result.motionTier).toBe('none');
  });

  test('detectTier with high-end headers yields elevated tiers', () => {
    const result = EdgeTier.detectTier({
      'sec-ch-device-memory': '8',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36',
      'sec-ch-viewport-width': '2560',
    });
    // High-end device should get at least animations tier
    expect(['animations', 'physics', 'compute']).toContain(result.motionTier);
  });

  test('tierDataAttributes generates valid HTML attributes', () => {
    const result = EdgeTier.detectTier({});
    const attrs = EdgeTier.tierDataAttributes(result);
    expect(attrs).toContain('data-czap-cap=');
    expect(attrs).toContain('data-czap-motion=');
    expect(attrs).toContain('data-czap-design=');
  });

  test('tierDataAttributes includes actual tier values', () => {
    const result = {
      capLevel: 'reactive' as const,
      motionTier: 'animations' as const,
      designTier: 'enhanced' as const,
    };
    const attrs = EdgeTier.tierDataAttributes(result);
    expect(attrs).toBe('data-czap-cap="reactive" data-czap-motion="animations" data-czap-design="enhanced"');
  });
});
