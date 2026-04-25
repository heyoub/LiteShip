import { describe, it, expect } from 'vitest';
import { fade, pulse, Beat } from '@czap/scene';

describe('envelope helpers', () => {
  it('fade.in returns a linear-in curve over the given span', () => {
    const env = fade.in(Beat(2));
    expect(env._t).toBe('envelope');
    expect(env.curve).toBe('linear-in');
    expect(env.span).toEqual(Beat(2));
  });
  it('fade.out returns a linear-out curve', () => {
    const env = fade.out(Beat(1));
    expect(env.curve).toBe('linear-out');
  });
  it('pulse.every returns a periodic envelope with amplitude', () => {
    const env = pulse.every(Beat(0.5), { amplitude: 0.3 });
    expect(env._t).toBe('envelope');
    expect(env.curve).toBe('pulse');
    expect(env.amplitude).toBe(0.3);
    expect(env.period).toEqual(Beat(0.5));
  });
});
