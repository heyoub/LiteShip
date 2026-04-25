/**
 * AVBridge -- SharedArrayBuffer timeline bridge for A/V convergence.
 *
 * Provides a single sample counter shared between an AudioWorklet
 * (which advances it) and the visual compositor (which reads it).
 * Works in both real-time (browser) and offline (deterministic) modes.
 *
 * Memory layout (SharedArrayBuffer, 24 bytes):
 *   Int32[0] -- sample counter (atomic increment by audio, atomic read by video)
 *   Int32[1] -- audio running flag (1 = playing, 0 = paused)
 *   Float64[1] -- audio start timestamp in ms (bytes 8-15, for drift calc)
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AVBridgeShape {
  readonly buffer: SharedArrayBuffer;
  readonly sampleRate: number;
  readonly fps: number;

  advanceSamples(count: number): void;
  getCurrentSample(): number;
  setRunning(running: boolean): void;
  isRunning(): boolean;

  getCurrentFrame(): number;
  sampleToTime(sample: number): number;
  timeToSample(time: number): number;

  isAudioAhead(): boolean;
  drift(): number;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUFFER_BYTE_LENGTH = 24;
const SAMPLE_COUNTER_IDX = 0;
const RUNNING_FLAG_IDX = 1;
const START_TIMESTAMP_F64_IDX = 1;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

interface AVBridgeConfig {
  readonly sampleRate: number;
  readonly fps: number;
  readonly buffer?: SharedArrayBuffer;
}

/**
 * Creates an AVBridge backed by a SharedArrayBuffer for lock-free
 * audio/video timeline synchronization between threads.
 *
 * @example
 * ```ts
 * const bridge = AVBridge.make({ sampleRate: 48000, fps: 60 });
 * bridge.setRunning(true);
 * bridge.advanceSamples(800); // AudioWorklet advances by 800 samples
 * const frame = bridge.getCurrentFrame(); // current video frame number
 * const drift = bridge.drift(); // fractional frame offset
 * bridge.reset(); // zero out counters
 * ```
 */
function _make(config: AVBridgeConfig): AVBridgeShape {
  const { sampleRate, fps } = config;
  if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
    throw new RangeError(`AVBridge.make: sampleRate must be a positive finite number, got ${sampleRate}`);
  }
  if (fps <= 0 || !Number.isFinite(fps)) {
    throw new RangeError(`AVBridge.make: fps must be a positive finite number, got ${fps}`);
  }
  const buffer = config.buffer ?? new SharedArrayBuffer(BUFFER_BYTE_LENGTH);
  const i32 = new Int32Array(buffer);
  const f64 = new Float64Array(buffer);

  return {
    buffer,
    sampleRate,
    fps,

    advanceSamples(count: number): void {
      Atomics.add(i32, SAMPLE_COUNTER_IDX, count);
    },

    getCurrentSample(): number {
      return Atomics.load(i32, SAMPLE_COUNTER_IDX);
    },

    setRunning(running: boolean): void {
      Atomics.store(i32, RUNNING_FLAG_IDX, running ? 1 : 0);
    },

    isRunning(): boolean {
      return Atomics.load(i32, RUNNING_FLAG_IDX) === 1;
    },

    getCurrentFrame(): number {
      const sample = Atomics.load(i32, SAMPLE_COUNTER_IDX);
      return Math.floor((sample / sampleRate) * fps);
    },

    sampleToTime(sample: number): number {
      return sample / sampleRate;
    },

    timeToSample(time: number): number {
      return Math.round(time * sampleRate);
    },

    isAudioAhead(): boolean {
      const sample = Atomics.load(i32, SAMPLE_COUNTER_IDX);
      const frame = Math.floor((sample / sampleRate) * fps);
      const samplesPerFrame = sampleRate / fps;
      return sample % samplesPerFrame > 0 || sample > (frame + 1) * samplesPerFrame;
    },

    drift(): number {
      const sample = Atomics.load(i32, SAMPLE_COUNTER_IDX);
      const exactFrame = (sample / sampleRate) * fps;
      const currentFrame = Math.floor(exactFrame);
      return exactFrame - currentFrame;
    },

    reset(): void {
      Atomics.store(i32, SAMPLE_COUNTER_IDX, 0);
      Atomics.store(i32, RUNNING_FLAG_IDX, 0);
      f64[START_TIMESTAMP_F64_IDX] = 0;
    },
  };
}

/**
 * AVBridge -- SharedArrayBuffer-based timeline bridge for audio/video convergence.
 * Provides atomic sample counting shared between AudioWorklet and visual compositor.
 *
 * @example
 * ```ts
 * const bridge = AVBridge.make({ sampleRate: 44100, fps: 30 });
 * bridge.setRunning(true);
 * bridge.advanceSamples(1470); // advance by one video frame worth of samples
 * bridge.getCurrentFrame(); // 1
 * bridge.sampleToTime(44100); // 1.0 (seconds)
 * bridge.timeToSample(0.5);   // 22050
 * ```
 */
export const AVBridge = { make: _make };

export declare namespace AVBridge {
  /** Structural shape of an AVBridge instance — sample counters, time conversions, reset. */
  export type Shape = AVBridgeShape;
  /** Configuration accepted by {@link AVBridge.make}: sample rate and fps. */
  export type Config = AVBridgeConfig;
}
