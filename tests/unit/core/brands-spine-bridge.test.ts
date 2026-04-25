import { describe, it, expect } from 'vitest';
import type { ContentAddress as SpineContentAddress } from '@czap/_spine';
import type { ContentAddress} from '@czap/core';
import { SignalInput, ThresholdValue, StateName } from '@czap/core';

describe('spine bridge', () => {
  it('re-exports ContentAddress type compatible with _spine', () => {
    const fromSpine: SpineContentAddress = 'fnv1a:abc123' as SpineContentAddress;
    const fromCore: ContentAddress = fromSpine;
    expect(fromCore).toBe('fnv1a:abc123');
  });

  it('runtime constructors still produce branded values', () => {
    const input = SignalInput('viewport.width');
    const threshold = ThresholdValue(768);
    const state = StateName('mobile');
    expect(input).toBe('viewport.width');
    expect(threshold).toBe(768);
    expect(state).toBe('mobile');
  });
});
