/**
 * Messages -- typed message protocol type guards.
 */

import { describe, test, expect } from 'vitest';
import { Messages } from '@czap/worker';
import { makeResolvedStateEnvelope } from '../../../packages/worker/src/messages.js';

describe('Messages', () => {
  test('isToWorker returns true for valid ToWorkerMessage', () => {
    expect(Messages.isToWorker({ type: 'init', config: {} })).toBe(true);
    expect(Messages.isToWorker({ type: 'compute' })).toBe(true);
    expect(Messages.isToWorker({ type: 'dispose' })).toBe(true);
  });

  test('isToWorker returns false for non-objects', () => {
    expect(Messages.isToWorker(null)).toBe(false);
    expect(Messages.isToWorker(undefined)).toBe(false);
    expect(Messages.isToWorker('string')).toBe(false);
    expect(Messages.isToWorker(42)).toBe(false);
  });

  test('isToWorker returns false for objects without type', () => {
    expect(Messages.isToWorker({})).toBe(false);
    expect(Messages.isToWorker({ name: 'test' })).toBe(false);
  });

  test('isFromWorker returns true for valid FromWorkerMessage', () => {
    expect(Messages.isFromWorker({ type: 'ready' })).toBe(true);
    expect(Messages.isFromWorker({ type: 'state', state: {} })).toBe(true);
    expect(Messages.isFromWorker({ type: 'error', message: 'oops' })).toBe(true);
  });

  test('isFromWorker returns false for non-objects', () => {
    expect(Messages.isFromWorker(null)).toBe(false);
    expect(Messages.isFromWorker(undefined)).toBe(false);
  });

  test('builds the resolved-state transport envelope with the current wire shape', () => {
    expect(
      makeResolvedStateEnvelope(
        'apply-resolved-state',
        [{ name: 'layout', state: 'tablet', generation: 2 }],
        true,
      ),
    ).toEqual({
      type: 'apply-resolved-state',
      states: [{ name: 'layout', state: 'tablet', generation: 2 }],
      ack: true,
    });
  });
});
