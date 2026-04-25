/**
 * Branded capability tier mapping -- `DeviceCapabilities` to `CapLevel` + `CapSet`.
 *
 * Heuristic mapping:
 *   - low GPU + reduced motion &rarr; `static`
 *   - low GPU &rarr; `styled`
 *   - mid GPU &rarr; `reactive`
 *   - mid GPU + enough cores &rarr; `animated`
 *   - high GPU + WebGPU &rarr; `gpu`
 *
 * @module
 */

import type { CapLevel, CapSet, MotionTier } from '@czap/core';
import type { DeviceCapabilities, ExtendedDeviceCapabilities } from './detect.js';

const CAP_LEVEL_ORDER: readonly CapLevel[] = ['static', 'styled', 'reactive', 'animated', 'gpu'] as const;

/**
 * Determine the highest capability level the device can support based on
 * its detected hardware and preference characteristics.
 */
// GPU tier mapping: 0=no GPU/software, 1=integrated (Intel UHD), 2=mid-range, 3=discrete high-end
export function tierFromCapabilities(caps: DeviceCapabilities): CapLevel {
  if (caps.prefersReducedMotion && caps.gpu <= 1) {
    return 'static';
  }

  if (caps.gpu === 0) {
    return 'styled';
  }

  if (caps.gpu === 1) {
    if (caps.cores >= 4 && caps.memory >= 4) return 'reactive';
    return 'styled';
  }

  if (caps.gpu === 2) {
    if (caps.prefersReducedMotion) return 'reactive';
    if (caps.cores >= 4 && caps.memory >= 4) return 'animated';
    return 'reactive';
  }

  // gpu === 3
  if (caps.webgpu && caps.cores >= 4 && caps.memory >= 4) {
    return caps.prefersReducedMotion ? 'animated' : 'gpu';
  }

  if (caps.prefersReducedMotion) return 'reactive';
  return 'animated';
}

/**
 * Build a CapSet containing all levels the device qualifies for.
 * A device at level X automatically has all levels below it.
 */
export function capSetFromCapabilities(caps: DeviceCapabilities): CapSet {
  const tier = tierFromCapabilities(caps);
  const tierIndex = CAP_LEVEL_ORDER.indexOf(tier);
  const granted = CAP_LEVEL_ORDER.slice(0, tierIndex + 1);

  return {
    _tag: 'CapSet' as const,
    levels: new Set(granted) as ReadonlySet<CapLevel>,
  };
}

// ---------------------------------------------------------------------------
// 2-Axis Tiers (design × motion)
// ---------------------------------------------------------------------------

/**
 * Visual fidelity tier derived from device capabilities.
 *
 * Drives the breadth of design signals the compositor emits: `minimal` is
 * optimized for forced-colors/low-update displays; `rich` unlocks wide-gamut
 * + HDR treatments. Used orthogonally to {@link MotionTier}.
 */
export type DesignTier = 'minimal' | 'standard' | 'enhanced' | 'rich';
export type { MotionTier } from '@czap/core';

/**
 * Map extended device capabilities to a design fidelity tier.
 * Forced colors / no-update screens get minimal; wide-gamut / HDR screens
 * get rich; standard otherwise with an enhanced middle ground.
 */
export function designTierFromCapabilities(caps: ExtendedDeviceCapabilities): DesignTier {
  if (caps.forcedColors || caps.updateRate === 'none') return 'minimal';
  if (caps.updateRate === 'slow') return 'standard';
  if (caps.colorGamut !== 'srgb' || caps.dynamicRange === 'high') return 'rich';
  if (!caps.prefersReducedTransparency && caps.prefersContrast === 'no-preference') return 'enhanced';
  return 'standard';
}

/**
 * Map extended device capabilities to a motion complexity tier.
 * Reduced-motion &rarr; `none`; GPU tier and core count gate the upper levels;
 * WebGPU availability unlocks the `compute` tier.
 */
export function motionTierFromCapabilities(caps: ExtendedDeviceCapabilities): MotionTier {
  if (caps.prefersReducedMotion) return 'none';
  if (caps.gpu === 0) return 'transitions';
  if (caps.gpu === 1) return caps.cores >= 4 ? 'animations' : 'transitions';
  if (caps.gpu === 2) return caps.cores >= 4 ? 'physics' : 'animations';
  return caps.webgpu ? 'compute' : 'physics';
}
