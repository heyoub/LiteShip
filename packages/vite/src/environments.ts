/**
 * Vite 8 Environment API configuration.
 *
 * Provides environment-specific resolve conditions and optimisation
 * settings for browser, server, and shader build targets.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named czap build environment. */
export type CzapEnvironmentName = 'browser' | 'server' | 'shader';

/**
 * Subset of a Vite `Environment` config that czap touches: resolve
 * conditions plus `optimizeDeps` include/exclude lists. Returned by
 * {@link getEnvironmentConfig} and merged into the host Vite config
 * via {@link buildEnvironments}.
 */
export interface CzapEnvironmentConfig {
  readonly resolve: {
    readonly conditions: string[];
    readonly extensions: string[];
  };
  readonly optimizeDeps: {
    readonly include: string[];
    readonly exclude: string[];
  };
}

// ---------------------------------------------------------------------------
// Environment Definitions
// ---------------------------------------------------------------------------

const BROWSER_ENV: CzapEnvironmentConfig = {
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
  },
  optimizeDeps: {
    include: ['@czap/core', '@czap/detect'],
    exclude: [],
  },
} as const;

const SERVER_ENV: CzapEnvironmentConfig = {
  resolve: {
    conditions: ['node', 'import', 'module', 'default'],
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  optimizeDeps: {
    include: [],
    exclude: ['@czap/core', '@czap/detect'],
  },
} as const;

const SHADER_ENV: CzapEnvironmentConfig = {
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
    extensions: ['.ts', '.js', '.glsl', '.wgsl', '.vert', '.frag'],
  },
  optimizeDeps: {
    include: ['@czap/core'],
    exclude: ['@czap/detect'],
  },
} as const;

const ENVIRONMENT_MAP: Record<CzapEnvironmentName, CzapEnvironmentConfig> = {
  browser: BROWSER_ENV,
  server: SERVER_ENV,
  shader: SHADER_ENV,
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the Vite environment configuration for a specific czap target.
 */
export function getEnvironmentConfig(name: CzapEnvironmentName): CzapEnvironmentConfig {
  return ENVIRONMENT_MAP[name];
}

/**
 * Build the Vite environments configuration object from a list of
 * requested environment names.
 */
export function buildEnvironments(names: readonly CzapEnvironmentName[]): Record<string, CzapEnvironmentConfig> {
  const result: Record<string, CzapEnvironmentConfig> = {};
  for (const name of names) {
    result[name] = getEnvironmentConfig(name);
  }
  return result;
}
