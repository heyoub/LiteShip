/**
 * AVBridge -- SharedArrayBuffer timeline bridge tests.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { AVBridge } from '@czap/core';

describe('AVBridge construction', () => {
  test('creates a bridge with correct sampleRate and fps', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.sampleRate).toBe(48000);
    expect(bridge.fps).toBe(30);
  });

  test('allocates a SharedArrayBuffer', () => {
    const bridge = AVBridge.make({ sampleRate: 44100, fps: 60 });
    expect(bridge.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(bridge.buffer.byteLength).toBeGreaterThanOrEqual(16);
  });

  test('accepts an existing SharedArrayBuffer', () => {
    const sab = new SharedArrayBuffer(24);
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30, buffer: sab });
    expect(bridge.buffer).toBe(sab);
  });

  test('starts at sample 0', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.getCurrentSample()).toBe(0);
  });
});

describe('AVBridge sample counter', () => {
  let bridge: AVBridge.Shape;

  beforeEach(() => {
    bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
  });

  test('advanceSamples increments the counter', () => {
    bridge.advanceSamples(128);
    expect(bridge.getCurrentSample()).toBe(128);
  });

  test('multiple advances accumulate', () => {
    bridge.advanceSamples(128);
    bridge.advanceSamples(128);
    bridge.advanceSamples(128);
    expect(bridge.getCurrentSample()).toBe(384);
  });

  test('advance by arbitrary amounts', () => {
    bridge.advanceSamples(1000);
    bridge.advanceSamples(600);
    expect(bridge.getCurrentSample()).toBe(1600);
  });
});

describe('AVBridge running flag', () => {
  test('starts not running', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.isRunning()).toBe(false);
  });

  test('setRunning toggles correctly', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.setRunning(true);
    expect(bridge.isRunning()).toBe(true);
    bridge.setRunning(false);
    expect(bridge.isRunning()).toBe(false);
  });
});

describe('AVBridge frame calculation', () => {
  test('frame 0 at sample 0', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.getCurrentFrame()).toBe(0);
  });

  test('frame advances after enough samples', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(1600); // 48000/30 = 1600 samples/frame
    expect(bridge.getCurrentFrame()).toBe(1);
  });

  test('frame calculation at various positions', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(3200); // 2 frames
    expect(bridge.getCurrentFrame()).toBe(2);

    bridge.advanceSamples(800); // 2.5 frames
    expect(bridge.getCurrentFrame()).toBe(2); // floor
  });

  test('frame calculation at 44100/60', () => {
    const bridge = AVBridge.make({ sampleRate: 44100, fps: 60 });
    bridge.advanceSamples(735); // 44100/60 = 735 samples/frame
    expect(bridge.getCurrentFrame()).toBe(1);
    bridge.advanceSamples(735);
    expect(bridge.getCurrentFrame()).toBe(2);
  });
});

describe('AVBridge time conversion', () => {
  test('sampleToTime at 48kHz', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.sampleToTime(48000)).toBe(1);
    expect(bridge.sampleToTime(24000)).toBe(0.5);
    expect(bridge.sampleToTime(0)).toBe(0);
  });

  test('timeToSample at 48kHz', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.timeToSample(1)).toBe(48000);
    expect(bridge.timeToSample(0.5)).toBe(24000);
    expect(bridge.timeToSample(0)).toBe(0);
  });

  test('roundtrip conversion', () => {
    const bridge = AVBridge.make({ sampleRate: 44100, fps: 60 });
    const time = 2.5;
    const sample = bridge.timeToSample(time);
    expect(bridge.sampleToTime(sample)).toBeCloseTo(time, 5);
  });
});

describe('AVBridge drift', () => {
  test('drift is 0 at exact frame boundaries', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    expect(bridge.drift()).toBe(0);
    bridge.advanceSamples(1600);
    expect(bridge.drift()).toBeCloseTo(0, 5);
  });

  test('drift is non-zero between frame boundaries', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(800); // half a frame
    expect(bridge.drift()).toBeCloseTo(0.5, 1);
  });

  test('drift is fractional frame offset', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(400); // quarter frame
    expect(bridge.drift()).toBeCloseTo(0.25, 1);
  });
});

describe('AVBridge audio lead detection', () => {
  test('isAudioAhead is false exactly on a frame boundary', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(1600);
    expect(bridge.isAudioAhead()).toBe(false);
  });

  test('isAudioAhead is true between frame boundaries', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(1601);
    expect(bridge.isAudioAhead()).toBe(true);
  });
});

describe('AVBridge reset', () => {
  test('reset clears sample counter and running flag', () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    bridge.advanceSamples(5000);
    bridge.setRunning(true);
    expect(bridge.getCurrentSample()).toBe(5000);
    expect(bridge.isRunning()).toBe(true);

    bridge.reset();
    expect(bridge.getCurrentSample()).toBe(0);
    expect(bridge.isRunning()).toBe(false);
    expect(bridge.getCurrentFrame()).toBe(0);
  });
});

describe('AVBridge shared buffer', () => {
  test('two bridges sharing the same SAB see the same counter', () => {
    const sab = new SharedArrayBuffer(24);
    const audio = AVBridge.make({ sampleRate: 48000, fps: 30, buffer: sab });
    const video = AVBridge.make({ sampleRate: 48000, fps: 30, buffer: sab });

    audio.advanceSamples(1600);
    expect(video.getCurrentSample()).toBe(1600);
    expect(video.getCurrentFrame()).toBe(1);

    audio.advanceSamples(1600);
    expect(video.getCurrentFrame()).toBe(2);
  });

  test('running flag is shared', () => {
    const sab = new SharedArrayBuffer(24);
    const audio = AVBridge.make({ sampleRate: 48000, fps: 30, buffer: sab });
    const video = AVBridge.make({ sampleRate: 48000, fps: 30, buffer: sab });

    audio.setRunning(true);
    expect(video.isRunning()).toBe(true);
    audio.setRunning(false);
    expect(video.isRunning()).toBe(false);
  });
});

describe('AVBridge input validation', () => {
  test('throws RangeError when sampleRate is 0', () => {
    expect(() => AVBridge.make({ sampleRate: 0, fps: 60 })).toThrow(RangeError);
  });

  test('throws RangeError when sampleRate is negative', () => {
    expect(() => AVBridge.make({ sampleRate: -1, fps: 60 })).toThrow(RangeError);
  });

  test('throws RangeError when sampleRate is Infinity', () => {
    expect(() => AVBridge.make({ sampleRate: Infinity, fps: 60 })).toThrow(RangeError);
  });

  test('throws RangeError when fps is 0', () => {
    expect(() => AVBridge.make({ sampleRate: 48000, fps: 0 })).toThrow(RangeError);
  });

  test('throws RangeError when fps is negative', () => {
    expect(() => AVBridge.make({ sampleRate: 48000, fps: -30 })).toThrow(RangeError);
  });

  test('throws RangeError when fps is Infinity', () => {
    expect(() => AVBridge.make({ sampleRate: 48000, fps: Infinity })).toThrow(RangeError);
  });
});
