/**
 * @czap/detect type spine -- device capability detection + branded tiers.
 */

import type { Effect } from 'effect';
import type { CapLevel, CapSet, MotionTier } from './core.d.ts';

// MotionTier canonical declaration lives in core.d.ts; re-exported here so
// `@czap/_spine` consumers reading the detect surface still see it on this
// sub-spine without an extra import.
export type { MotionTier };

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. DETECTION TIERS
// ═══════════════════════════════════════════════════════════════════════════════

export type GPUTier = 0 | 1 | 2 | 3;

export interface DeviceCapabilities {
  readonly gpu: GPUTier;
  readonly cores: number;
  readonly memory: number;
  readonly webgpu: boolean;
  readonly touchPrimary: boolean;
  readonly prefersReducedMotion: boolean;
  readonly prefersColorScheme: 'light' | 'dark';
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly connection?: {
    readonly effectiveType: string;
    readonly downlink: number;
    readonly saveData: boolean;
  };
}

export interface DetectionResult {
  readonly capabilities: DeviceCapabilities;
  readonly tier: CapLevel;
  readonly capSet: CapSet;
  readonly confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. DETECTION API
// ═══════════════════════════════════════════════════════════════════════════════

export declare function detect(): Effect.Effect<DetectionResult>;

export declare function detectGPUTier(): Effect.Effect<GPUTier>;

export declare function tierFromCapabilities(caps: DeviceCapabilities): CapLevel;

export declare function capSetFromCapabilities(caps: DeviceCapabilities): CapSet;

/** Watch for capability changes (viewport resize, media query changes, etc.) */
export declare function watchCapabilities(
  onChange: (result: DetectionResult) => void,
): Effect.Effect<void, never, import('effect').Scope.Scope>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. 2-AXIS TIERS (design × motion)
// ═══════════════════════════════════════════════════════════════════════════════

export type DesignTier = 'minimal' | 'standard' | 'enhanced' | 'rich';

export interface ExtendedDeviceCapabilities extends DeviceCapabilities {
  readonly prefersContrast: 'no-preference' | 'more' | 'less' | 'custom';
  readonly forcedColors: boolean;
  readonly prefersReducedTransparency: boolean;
  readonly dynamicRange: 'standard' | 'high';
  readonly colorGamut: 'srgb' | 'p3' | 'rec2020';
  readonly updateRate: 'fast' | 'slow' | 'none';
}

export interface ExtendedDetectionResult extends DetectionResult {
  readonly capabilities: ExtendedDeviceCapabilities;
  readonly designTier: DesignTier;
  readonly motionTier: MotionTier;
}

export declare function designTierFromCapabilities(caps: ExtendedDeviceCapabilities): DesignTier;
export declare function motionTierFromCapabilities(caps: ExtendedDeviceCapabilities): MotionTier;
