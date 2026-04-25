/**
 * Worker package smoke test.
 */

import { describe, test, expect } from 'vitest';
import { SPSCRing, Messages } from '@czap/worker';

describe('worker smoke', () => {
  test('SPSCRing exports are defined', () => {
    expect(SPSCRing).toBeDefined();
  });

  test('Messages exports are defined', () => {
    expect(Messages).toBeDefined();
  });
});
