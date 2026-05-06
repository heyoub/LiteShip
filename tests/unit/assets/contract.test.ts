import { describe, it, expect, beforeEach } from 'vitest';
import { defineAsset, AssetRef, getAssetRegistry } from '@czap/assets';
import { resetAssetRegistry } from '@czap/assets/testing';

describe('Asset capsule', () => {
  beforeEach(() => resetAssetRegistry());

  it('defineAsset registers an audio asset as a cachedProjection', () => {
    const a = defineAsset({
      id: 'intro-bed-test',
      source: 'intro-bed.wav',
      kind: 'audio',
      budgets: { decodeP95Ms: 50, memoryMb: 30 },
      invariants: [],
      attribution: { license: 'CC-BY-4.0', author: 'Test' },
    });
    expect(a._kind).toBe('cachedProjection');
    expect(a.name).toBe('intro-bed-test');
    expect(getAssetRegistry().has('intro-bed-test')).toBe(true);
  });

  it('AssetRef resolves to a registered id', () => {
    defineAsset({
      id: 'test-img',
      source: 'test.png',
      kind: 'image',
      budgets: { decodeP95Ms: 20 },
      invariants: [],
    });
    expect(AssetRef('test-img')).toBe('test-img');
  });

  it('AssetRef throws on unregistered id', () => {
    expect(() => AssetRef('nonexistent-123')).toThrow(/not registered/);
  });
});
