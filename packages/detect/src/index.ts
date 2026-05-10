/**
 * `@czap/detect` — **LiteShip** capability probes: device signals mapped to
 * the `CapLevel` lattice and motion/design tiers in `@czap/core`.
 *
 * Probes browser APIs for GPU tier, CPU cores, memory, input modality,
 * motion preferences, color scheme, viewport dimensions, DPR, and
 * network connection quality. Maps detected capabilities to the
 * `CapLevel` lattice from `@czap/core`.
 *
 * @module
 */

export type {
  GPUTier,
  DeviceCapabilities,
  DetectionResult,
  ExtendedDeviceCapabilities,
  ExtendedDetectionResult,
} from './detect.js';
export { detect, detectGPUTier, watchCapabilities, Detect } from './detect.js';
export type { DesignTier, MotionTier } from './tiers.js';
export {
  tierFromCapabilities,
  capSetFromCapabilities,
  designTierFromCapabilities,
  motionTierFromCapabilities,
} from './tiers.js';
